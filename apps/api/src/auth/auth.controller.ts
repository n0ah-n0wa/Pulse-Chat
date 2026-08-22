import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  loginSchema,
  logoutRequestSchema,
  refreshTokenRequestSchema,
  registerSchema,
  type AuthSessionResponse,
  type AuthTokensResponse,
  type CurrentUserProfile,
  type LoginInput,
  type LogoutInput,
  type RefreshTokenInput,
  type RegisterInput,
} from '@pulse-chat/shared';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js';
import { AuthGuard } from './guards/auth.guard.js';
import type { AuthenticatedUser } from './types/authenticated-request.types.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Register a new user account' })
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ): Promise<AuthSessionResponse> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput): Promise<AuthSessionResponse> {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access token' })
  refresh(
    @Body(new ZodValidationPipe(refreshTokenRequestSchema)) body: RefreshTokenInput,
  ): Promise<AuthTokensResponse> {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body(new ZodValidationPipe(logoutRequestSchema)) body: LogoutInput): Promise<void> {
    await this.authService.logout(body.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  me(@CurrentUser() currentUser: AuthenticatedUser): Promise<CurrentUserProfile> {
    return this.authService.getCurrentUser(currentUser.userId);
  }
}
