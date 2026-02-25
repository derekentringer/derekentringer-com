export interface User {
  id: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
  refreshToken?: string;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
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
