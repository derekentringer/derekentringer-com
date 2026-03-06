export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  role: "admin" | "user";
  totpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
  refreshToken?: string;
  requiresTotp?: boolean;
  totpToken?: string;
  mustChangePassword?: boolean;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
  user?: User;
  refreshToken?: string;
}

export interface PinVerifyRequest {
  pin: string;
}

export interface PinVerifyResponse {
  pinToken: string;
  expiresIn: number;
}

export interface PinJwtPayload {
  sub: string;
  type: "pin";
  iat: number;
  exp: number;
}

export interface LogoutResponse {
  message: string;
}

export interface RevokeAllSessionsResponse {
  revokedCount: number;
  message: string;
}

export interface AuthPluginOptions {
  jwtSecret: string;
  accessTokenExpiry?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface TotpSetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  otpauthUrl: string;
}

export interface TotpVerifySetupResponse {
  backupCodes: string[];
}

export interface TotpVerifyRequest {
  totpToken: string;
  code: string;
}
