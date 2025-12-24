import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ModelCollectionMap, ModelFieldsMap } from './utils/model-configure';

@Injectable()
export class CommonModelService {
  private readonly logger = new Logger(CommonModelService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  private getCollectionName(business: string, model: string): string {
    const name = ModelCollectionMap[business]?.[model];
    if (!name) {
      throw new BadRequestException(`Unknown collection for ${business}/${model}`);
    }
    return name;
  }

  private getProjection(business: string, model: string, type: string = 'pages'): any {
    return ModelFieldsMap[business]?.[model]?.[type] || {};
  }

  async getPages(business: string, model: string, query: any) {
    const collectionName = this.getCollectionName(business, model);
    const collection = this.connection.collection(collectionName);
    
    const { page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = this.transformQueryParams(query);

    const [records, total] = await Promise.all([
      collection
        .find(filter)
        .project(this.getProjection(business, model, 'pages'))
        .sort({ _id: -1 })
        .skip(skip)
        .limit(Math.min(Number(limit), 100))
        .toArray(),
      collection.countDocuments(filter),
    ]);

    const formattedRecords = records.map(item => ({
      ...item,
      createTime: item.createTime ? new Date(item.createTime).toLocaleString() : undefined,
      updateTime: item.updateTime ? new Date(item.updateTime).toLocaleString() : undefined,
    }));

    return {
      records: formattedRecords,
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }

  async getInfo(business: string, model: string, query: any) {
    const collectionName = this.getCollectionName(business, model);
    const collection = this.connection.collection(collectionName);
    
    const filter = this.getUniqueParams(query);
    const doc = await collection.findOne(filter, { 
        projection: this.getProjection(business, model, 'info') 
    });

    if (!doc) {
      throw new BadRequestException('未查到数据');
    }

    return {
      ...doc,
      createTime: doc.createTime ? new Date(doc.createTime).toLocaleString() : undefined,
      updateTime: doc.updateTime ? new Date(doc.updateTime).toLocaleString() : undefined,
    };
  }

  async deleteInfo(business: string, model: string, query: any) {
    const collectionName = this.getCollectionName(business, model);
    const collection = this.connection.collection(collectionName);
    
    const filter = this.getUniqueParams(query);
    const result = await collection.deleteOne(filter);

    if (result.deletedCount === 0) {
        throw new BadRequestException('删除失败或数据不存在');
    }

    return { ok: true };
  }

  private transformQueryParams(query: any) {
    const { id, createTime, updateTime, page, limit, gt, lt, ...params } = query;
    const filter: any = {};

    Object.keys(params).forEach(key => {
        const val = params[key];
        if (typeof val === 'string' && val !== '') {
            filter[key] = { $regex: val, $options: 'i' };
        } else if (val !== undefined && val !== null && val !== '') {
            filter[key] = val;
        }
    });

    if (id) filter._id = id;
    
    if (Array.isArray(createTime) && createTime.length === 2) {
        filter.createTime = { 
            $gte: new Date(createTime[0]), 
            $lte: new Date(createTime[1]) 
        };
    }

    if (Array.isArray(updateTime) && updateTime.length === 2) {
        filter.updateTime = { 
            $gte: new Date(updateTime[0]), 
            $lte: new Date(updateTime[1]) 
        };
    }

    return filter;
  }

  private getUniqueParams(query: any) {
    const { id, code, name } = query;
    if (id) return { _id: id };
    if (code) return { code };
    if (name) return { name };
    throw new BadRequestException('缺少必要参数(id/code/name)');
  }
}
