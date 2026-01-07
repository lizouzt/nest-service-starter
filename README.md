# NestJS Microservice(Modernized)

基于 **NestJS** 和 **TypeScript** 构建的高效后端服务层 (BFF)，由原 Koa2 项目重构而来。它负责处理监控数据上报、分片文件上传、以及通用的动态数据查询业务。

## 1. 架构概览

项目采用 NestJS 框架，遵循模块化、依赖注入 (DI) 和声明式编程的最佳实践。

*   **核心框架**: NestJS (v10.x)
*   **语言**: TypeScript (强类型，严格模式)
*   **数据库**: MongoDB (Mongoose) & Redis (Cache-manager)
*   **日志**: Pino (nestjs-pino)
*   **安全**: Passport-JWT (身份验证) + 权限守卫 (Guard)
*   **流量控制**: Throttler (速率限制)

## 2. 目录结构

```text
src/
├── main.ts                 # 应用入口，配置全局拦截器、过滤器、管道
├── app.module.ts           # 根模块，集成配置、数据库、缓存和业务模块
├── config/                 # 配置中心 (支持 JSON 继承与深度合并)
├── common/                 # 通用基础设施
│   ├── filters/            # 全局异常过滤器 (统一错误响应格式)
│   ├── guards/             # 速率限制守卫
│   └── interceptors/       # 响应转换拦截器 (统一成功响应格式)
└── modules/                # 业务逻辑模块
    ├── auth/               # 鉴权模块 (JWT Strategy, Permissions Guard)
    ├── file-center/        # 文件中心 (分片上传, 断点续传, 图片优化)
    └── common-model/       # 通用数据模块 (动态 CRUD 引擎)
```

## 3. 快速开始

### 安装依赖
```bash
npm install
```

### 开发环境启动 (NestJS)
```bash
# 默认监听 8001 端口 (可在 config/base.json 修改)
npm run start:dev or npm run dev
```

### 生产编译与启动
```bash
npm run build
npm run start:prod
```

## 4. 核心功能说明

### 4.1 文件服务 (File Center)
*   **特性**:
    *   **分片上传**: 支持大文件切片上传与合并。
    *   **秒传**: 基于 ETag (文件指纹) 的重复文件检测。
    *   **图片优化**: 自动生成 PC/H5 专用的 WebP 格式预览图。
    *   **CDN 同步**: 自动通过 SCP 分发文件至边缘节点。

### 4.2 动态 CRUD (Common Model)
*   **接口**: `/cmd/:business/:model/[cpages|cinfo|cdel]`
*   **特性**:
    *   动态权限校验：自动识别 `business_model_action` 权限位。
    *   通用查询：支持正则搜索、日期范围过滤、自动分页。

## 5. 配置管理

配置文件位于根目录的 `/config` 文件夹下。NestJS 应用会自动按照以下顺序合并配置：
`base.json` < `production.json` (如果是 local 环境) < `{NODE_ENV}.json`。

## 6. 开发规范

1.  **DTO**: 所有入参必须定义 DTO 并开启 `ValidationPipe`。
2.  **Service**: 业务逻辑必须封装在 Service 中，禁止在 Controller 编写复杂逻辑。
3.  **Guard**: 敏感接口必须使用 `@UseGuards(JwtAuthGuard)` 保护。
4.  **Response**: 系统会自动通过 `TransformInterceptor` 包装响应，直接返回数据对象即可。

---

## 7. 许可证
ISC