export interface User {
  id: string;
  email: string;
  createdAt: Date;
}
export interface JwtPayload {
  userId: string;
  email: string;
}
