import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

type FastifyRequest = CreateFastifyContextOptions['req'];

export type JwtPayload = {
  userId: string;
  email: string;
};

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(private readonly config: ConfigService) {
    this.jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'change-me';
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  signToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' });
  }

  verifyToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      if (!decoded.userId || !decoded.email) return null;
      return { userId: decoded.userId, email: decoded.email };
    } catch {
      return null;
    }
  }

  detectTimezone(req: FastifyRequest): string {
    const header = req.headers['x-timezone'];
    if (typeof header === 'string' && header.length > 0) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: header });
        return header;
      } catch {
        // invalid timezone
      }
    }
    return 'UTC';
  }
}
