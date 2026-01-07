import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as _ from 'lodash';
import { AggregateRequestDto, ProxyRequestItemDto, ProjectionDto } from './dto/cc-proxy.dto';

// 定义每个子任务的执行结果接口，避免到处用 any
interface ExecutionResult {
  id: string;
  success: boolean;
  data?: any;
  error?: any;
}

@Injectable()
export class CcProxyService {
  private readonly logger = new Logger(CcProxyService.name);
  // 允许透传的 Header 白名单，防止乱传导致安全问题
  private readonly ALLOWED_HEADERS = ['authorization', 'app-id', 'resource-id', 'x-trace-id', 'cookie'];

  constructor(private readonly httpService: HttpService) { }

  /**
   * 聚合请求的主入口方法
   * 负责解析依赖关系、并发调度执行、收集结果
   */
  async aggregate(dto: AggregateRequestDto, clientHeaders: Record<string, string>) {
    const context: Record<string, any> = {};
    const errors: Record<string, any> = {};
    const pendingItems = [...dto.items];
    const completedIds = new Set<string>();

    // 只挑出白名单里的 Header，其他的丢掉
    const forwardedHeaders = _.pick(clientHeaders, this.ALLOWED_HEADERS);
    // 这里的 commonHeaders 是 DTO 里配的通用 Header，合并一下
    const baseHeaders = { ...forwardedHeaders, ...dto.commonHeaders };

    let round = 0;
    // 防止死循环，最大轮数不能超过任务总数+1
    const maxRounds = pendingItems.length + 1;

    while (pendingItems.length > 0) {
      round++;
      if (round > maxRounds) {
        throw new BadRequestException('Detected dependency cycle or deadlock (检测到依赖死循环或死锁)');
      }

      // 阶段 1: 找出这一轮能跑的任务
      // 如果一个任务没有依赖，或者它依赖的任务都跑完了，那它就可以跑
      const runnableIndices: number[] = [];

      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        const dependencies = item.dependsOn || [];

        // 检查是不是所有依赖ID都在 completedIds 里了
        const canRun = dependencies.every(depId => completedIds.has(depId));

        if (canRun) {
          // 还要检查一下依赖的任务是不是真的成功了（context里有数据）
          // 如果允许部分成功(allowPartial=true)，那依赖失败了咱们就跳过这个任务，不报错
          const depsSuccess = dependencies.every(depId => context[depId] !== undefined);

          if (!depsSuccess && dto.allowPartial) {
            // 依赖挂了，标记这个任务也跳过
            errors[item.id] = { error: 'Dependency failed (依赖任务失败)', skipped: true };
            // 虽然跳过了，但也算它"处理完"了，免得阻塞后面（虽然逻辑上后面依赖它的也得跳过）
            // 放到 runnableIndices 里，但在执行阶段我们会直接返回失败结果
            runnableIndices.push(i);
          } else if (!depsSuccess && !dto.allowPartial) {
            // 严格模式下依赖挂了，其实上一轮就该报错了，这里只是防御性逻辑
          } else {
            // 依赖都正常，加入执行队列
            runnableIndices.push(i);
          }
        }
      }

      // 如果还有任务没跑完，但这一轮一个能跑的都找不到，那就是死锁了
      if (runnableIndices.length === 0) {
        this.logger.error(`Deadlock detected. Pending: ${pendingItems.map(i => i.id).join(',')}`);
        throw new BadRequestException(`Unresolvable dependencies: ${pendingItems.map(i => i.id).join(', ')}`);
      }

      // 阶段 2: 并发执行这一批任务
      const batchPromises = runnableIndices.map(index => {
        const item = pendingItems[index];
        // 如果是因为依赖失败进来的，直接返回失败结果，别发请求了
        if (item.dependsOn && item.dependsOn.some(dep => errors[dep])) {
          return Promise.resolve<ExecutionResult>({
            id: item.id,
            success: false,
            error: 'Dependency failed (依赖任务失败)'
          });
        }
        // 正常执行
        return this.executeItem(item, baseHeaders, context);
      });

      const results = await Promise.all(batchPromises);

      // 阶段 3: 更新上下文
      for (const res of results) {
        if (res.success) {
          context[res.id] = res.data;
          // 标记为已完成，这样依赖它的任务下一轮就能跑了
          completedIds.add(res.id);
        } else {
          errors[res.id] = res.error;
          if (!dto.allowPartial) {
            // 如果是严格模式（不允许部分失败），只要有一个挂了就全盘报错
            throw new InternalServerErrorException(`Request ${res.id} failed: ${JSON.stringify(res.error)}`);
          }
          // 如果允许部分失败，就把错误记下来，循环继续。
          // 注意：失败的任务我们没有加到 completedIds，也没有加到 context。
          // 但为了让循环能走下去，我们在后面会把它从 pending 列表里移除。
        }
      }

      // 把这一轮处理过的任务（不管成功失败）都从等待列表里剔除
      const processedIds = new Set(results.map(r => r.id));
      const nextPending = pendingItems.filter(item => !processedIds.has(item.id));

      // 更新 pending 列表
      pendingItems.length = 0;
      pendingItems.push(...nextPending);
    }

    return {
      success: Object.keys(errors).length === 0,
      data: context,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }

  private async executeItem(item: ProxyRequestItemDto, baseHeaders: Record<string, string>, context: Record<string, any>): Promise<ExecutionResult> {
    try {
      // 1. 替换参数里的占位符 (比如 $userId)
      const url = this.resolvePlaceholders(item.url, context);
      const params = this.resolvePlaceholders(item.params, context);
      const data = this.resolvePlaceholders(item.data, context);
      const headers = { ...baseHeaders, ...item.headers };

      // 2. 发起 HTTP 请求
      const start = Date.now();
      const response = await firstValueFrom(
        this.httpService.request({
          url,
          method: item.method as any,
          params,
          data,
          headers,
        })
      );
      const duration = Date.now() - start;
      this.logger.log(`[CcProxy] ${item.method} ${url} - ${response.status} - ${response.data?.code} (${duration}ms)`);

      if (response.status < 200 || response.status >= 300) {
        /** 冗余一下 HTTP 状态码错误处理 */
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } else if (response.data && response.data.code && response.data.code !== 200) {
        /** 业务错误码处理 */
        throw new Error(`API Error Code ${response.data.code}: ${response.data?.msg || 'No message'}`);
      }
      // 3. 处理字段过滤 (Projection)
      let resultData = response.data;
      if (item.projection) {
        resultData = this.applyProjection(resultData, item.projection);
      }

      return { id: item.id, success: true, data: resultData };

    } catch (error: any) {
      this.logger.error(`[CcProxy] Failed ${item.id}: ${error.message}`, error.stack);
      // 尽量返回接口的原始报错信息，没有的话就用 error.message
      return {
        id: item.id,
        success: false,
        error: error.response?.data?.msg || error.message
      };
    }
  }

  /**
   * 递归解析对象/字符串里的占位符
   * 支持 $taskId.data.field 这种直接替换，也支持 "ID is ${taskId.id}" 这种模板替换
   */
  private resolvePlaceholders(target: any, context: Record<string, any>): any {
    if (!target) return target;

    if (typeof target === 'string') {
      // 情况1: 整个值就是个变量，比如 "$user.id"，直接替换成对应的值（可能是对象、数字等）
      if (target.startsWith('$')) {
        const path = target.substring(1); // 去掉开头的 $
        const val = _.get(context, path);
        // 如果取不到值，就原样返回，防止误伤
        return val !== undefined ? val : target;
      }
      // 情况2: 字符串模板，比如 "User ID is ${user.id}"
      return target.replace(/\$\{([^}]+)\}/g, (match, path) => {
        const val = _.get(context, path);
        return val !== undefined ? val : '';
      });
    }

    // 数组递归处理
    if (Array.isArray(target)) {
      return target.map(item => this.resolvePlaceholders(item, context));
    }

    // 对象递归处理
    if (typeof target === 'object') {
      const result: any = {};
      for (const key of Object.keys(target)) {
        result[key] = this.resolvePlaceholders(target[key], context);
      }
      return result;
    }

    return target;
  }

  /**
   * 仿 MongoDB 的字段过滤逻辑
   * 如果返回的数据包了一层 { code: 0, data: ... }，会自动识别里面的 data 进行处理
   */
  private applyProjection(data: any, projection: ProjectionDto) {
    if (!data) return data;

    // 智能判断：如果数据里有个 'data' 字段且是对象或数组，大概率是标准包装结构
    // 这种情况下，我们默认用户想过滤的是里面的业务数据，而不是外层的 code/msg
    if (data.data && (Array.isArray(data.data) || typeof data.data === 'object')) {
      const innerData = data.data;
      if (innerData) {
        return {
          ...data,
          data: this.processProjection(innerData, projection)
        };
      }
    }

    // 否则直接对整个对象处理
    return this.processProjection(data, projection);
  }

  // 实际执行 pick/omit 的逻辑
  private processProjection(target: any, projection: ProjectionDto) {
    if (Array.isArray(target)) {
      return target.map(item => this.processProjection(item, projection));
    }
    if (typeof target === 'object' && target !== null) {
      if (projection.mode === 'include') {
        return _.pick(target, projection.fields);
      } else if (projection.mode === 'exclude') {
        return _.omit(target, projection.fields);
      }
    }
    return target;
  }
}