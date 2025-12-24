import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CommonModelService } from './common-model.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permission } from '../auth/decorators/permissions.decorator';

@Controller('cmd/:business/:model')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommonModelController {
  constructor(private readonly commonModelService: CommonModelService) {}

  @Post('cpages')
  async getPages(
    @Param('business') business: string,
    @Param('model') model: string,
    @Body() body: any,
  ) {
    // Dynamic permission check: business_model_pages
    // We can use a trick here or just rely on the guard if we pass metadata
    return this.commonModelService.getPages(business, model, body);
  }

  @Post('cinfo')
  async getInfo(
    @Param('business') business: string,
    @Param('model') model: string,
    @Body() body: any,
  ) {
    return this.commonModelService.getInfo(business, model, body);
  }

  @Post('cdel')
  @Permission('delete') // This is static, but PermissionsGuard in auth module
  // handles business_model + _delete
  async deleteInfo(
    @Param('business') business: string,
    @Param('model') model: string,
    @Body() body: any,
  ) {
    return this.commonModelService.deleteInfo(business, model, body);
  }
}
