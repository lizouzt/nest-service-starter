import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { exec } from 'child_process';
import { StaticFile, FileStorageType } from './schemas/static-file.schema';
import { UploadInitDto } from './dto/upload-init.dto';

const SLICE_CACHE_TIME = 10 * 60; // 10分钟

@Injectable()
export class FileCenterService {
  private readonly logger = new Logger(FileCenterService.name);
  private readonly resourcesPath: string;

  constructor(
    @InjectModel(StaticFile.name) private staticFileModel: Model<StaticFile>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    this.resourcesPath = this.configService.get<string>('RESOURCES_PATH');
  }

  async uploadInit(dto: UploadInitDto) {
    const { fileSignature } = dto;
    
    // 检查重复 (秒传)
    const existingFile = await this.staticFileModel.findOne({ etag: fileSignature });
    if (existingFile) {
      return {
        uploadType: 1, // 1: 秒传
        url: existingFile.url,
        fileName: existingFile.name,
      };
    }

    const taskId = fileSignature;
    const taskInfo = {
      ...dto,
      trunkCount: Math.ceil(dto.fileSize / dto.trunkSize),
      status: 'pending',
    };

    await this.cacheManager.set(`upload_task:${taskId}`, JSON.stringify(taskInfo), SLICE_CACHE_TIME);

    return {
      taskId,
      trunkCount: taskInfo.trunkCount,
      uploadType: 0, // 0: 需要上传
    };
  }

  async getSliceStatus(taskId: string) {
    const taskInfoStr = await this.cacheManager.get<string>(`upload_task:${taskId}`);
    if (!taskInfoStr) {
      throw new BadRequestException('上传任务不存在或已过期');
    }
    const taskInfo = JSON.parse(taskInfoStr);

    const chunkDir = path.join(this.resourcesPath, 'chunks', taskId);
    let uploadedChunks = [];

    if (fs.existsSync(chunkDir)) {
      const files = await fs.promises.readdir(chunkDir);
      uploadedChunks = files.map(Number);
    }
    uploadedChunks.sort((a, b) => a - b);

    const toUpTrunkNum = [];
    for (let i = 1; i <= taskInfo.trunkCount; i++) {
      if (!uploadedChunks.includes(i)) {
        toUpTrunkNum.push(i);
      }
    }

    return toUpTrunkNum;
  }

  async handleChunk(taskId: string, trunkNum: string, tempPath: string) {
    const taskInfoStr = await this.cacheManager.get<string>(`upload_task:${taskId}`);
    if (!taskInfoStr) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      throw new BadRequestException('上传任务不存在或已过期');
    }
    const taskInfo = JSON.parse(taskInfoStr);

    try {
      const chunkDir = path.join(this.resourcesPath, 'chunks', taskInfo.fileSignature);
      if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir, { recursive: true });
      }

      const chunkPath = path.join(chunkDir, String(trunkNum));
      await fs.promises.rename(tempPath, chunkPath);

      // 刷新过期时间
      await this.cacheManager.set(`upload_task:${taskId}`, taskInfoStr, SLICE_CACHE_TIME);
      return { ok: true };
    } catch (error) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      throw error;
    }
  }

  async completeUpload(taskId: string) {
    const taskKey = `upload_task:${taskId}`;
    const taskInfoStr = await this.cacheManager.get<string>(taskKey);
    if (!taskInfoStr) {
      throw new BadRequestException('上传任务不存在或已过期');
    }
    const taskInfo = JSON.parse(taskInfoStr);
    const { fileSignature, fileName, fileSize } = taskInfo;

    const chunkDir = path.join(this.resourcesPath, 'chunks', fileSignature);
    if (!fs.existsSync(chunkDir)) {
      throw new BadRequestException('分片文件不存在');
    }

    const destPath = path.join(this.resourcesPath, fileName);
    const chunks = await fs.promises.readdir(chunkDir);
    chunks.sort((a, b) => Number(a) - Number(b));

    const writer = fs.createWriteStream(destPath);
    for (const chunk of chunks) {
      const chunkPath = path.join(chunkDir, chunk);
      const reader = fs.createReadStream(chunkPath);
      await new Promise((resolve, reject) => {
        reader.pipe(writer, { end: false });
        reader.on('end', resolve);
        reader.on('error', reject);
      });
    }
    writer.end();

    // 校验文件大小
    const fileStat = await fs.promises.stat(destPath);
    if (fileStat.size !== Number(fileSize)) {
      fs.unlinkSync(destPath);
      await this.cacheManager.del(taskKey);
      await fs.promises.rm(chunkDir, { recursive: true, force: true });
      throw new BadRequestException('文件合并异常，大小不一致');
    }

    try {
      const result = await this.storeFile({
        taskId,
        fileName,
        tempPath: destPath,
        etag: fileSignature,
        lastModified: taskInfo.lastModified,
        storeType: FileStorageType.PRIVATE_CDN
      });
      
      await fs.promises.rm(chunkDir, { recursive: true, force: true });
      return result;
    } catch (error) {
       throw new BadRequestException(error.message);
    }
  }

  private async storeFile(data: { 
      tempPath: string, 
      fileName: string, 
      etag: string, 
      lastModified: number, 
      storeType: number,
      taskId?: string 
    }) {
    const { tempPath, fileName, etag, storeType, taskId } = data;
    const ext = fileName.match(/\.([^\. ]+)$/)?.[1] ?? '';
    const storeName = etag + (ext ? `.${ext}` : '');
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext.toLowerCase());

    const destDir = this.resourcesPath;
    const orgFilePath = path.join(destDir, storeName);
    
    await fs.promises.rename(tempPath, orgFilePath);

    const remoteCdnPath = this.configService.get<string>('CDN_PATH');
    let pcUrl, h5Url;

    try {
        if (isImage) {
            const { pcFilePath, h5FilePath } = await this.optimizeImage(orgFilePath, etag);
            
            await this.uploadToCDN(pcFilePath, `${remoteCdnPath}/pc`);
            await this.uploadToCDN(h5FilePath, `${remoteCdnPath}/h5`);
            await this.uploadToCDN(orgFilePath, `${remoteCdnPath}/attach`);

            pcUrl = this.getFileUrl(storeType, `pc/${path.basename(pcFilePath)}`);
            h5Url = this.getFileUrl(storeType, `h5/${path.basename(h5FilePath)}`);
            
            fs.unlinkSync(pcFilePath);
            fs.unlinkSync(h5FilePath);
        } else {
            await this.uploadToCDN(orgFilePath, `${remoteCdnPath}/attach`);
        }

        const orgUrl = this.getFileUrl(storeType, `attach/${storeName}`);
        
        // 保存到数据库
        const fileStat = await fs.promises.stat(orgFilePath);
        const fileData = {
            name: fileName,
            size: fileStat.size,
            lastModified: new Date(data.lastModified),
            etag: etag,
            storeType,
            url: orgUrl,
            pcUrl,
            h5Url,
        };

        await this.staticFileModel.create(fileData);
        if (taskId) {
            await this.cacheManager.del(`upload_task:${taskId}`);
        }

        return fileData;
    } finally {
        if (fs.existsSync(orgFilePath)) fs.unlinkSync(orgFilePath);
    }
  }

  private async optimizeImage(filePath: string, etag: string) {
    const destDir = this.resourcesPath;
    const pcFilePath = path.join(destDir, `${etag}_pc.webp`);
    const h5FilePath = path.join(destDir, `${etag}_h5.webp`);

    await sharp(filePath).webp({ quality: 100 }).toFile(pcFilePath);
    await sharp(filePath).webp({ quality: 80 }).toFile(h5FilePath);

    return { pcFilePath, h5FilePath };
  }

  private async uploadToCDN(filePath: string, remotePath: string) {
    const cdnNames = this.configService.get<string[]>('CDN_NAME');
    if (!cdnNames || cdnNames.length === 0) return;

    const promises = cdnNames.map(cName => {
        return new Promise<void>((resolve, reject) => {
            const command = `scp ${filePath} ${cName}:${remotePath}`;
            exec(command, (error) => {
                if (error) {
                    this.logger.error(`CDN Sync Failed: ${error.message}`);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    });

    await Promise.all(promises);
  }

  private getFileUrl(storeType: number, fileName: string) {
    const uris = this.configService.get<any>('RESOURCES_URI');
    if (storeType === FileStorageType.LOCAL) return `${uris.LOCAL}/${fileName}`;
    if (storeType === FileStorageType.OSS) return `${uris.OSS}/${fileName}`;
    if (storeType === FileStorageType.PRIVATE_CDN) return `${uris.CDN}/${fileName}`;
    throw new Error('Unknown store type');
  }
}
