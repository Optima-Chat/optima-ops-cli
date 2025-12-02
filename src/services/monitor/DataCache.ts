import type {
  ServiceHealth,
  EC2Stats,
  ECSServiceStats,
} from '../../types/monitor.js';

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  ttl: number; // 生存时间（毫秒）
}

/**
 * 数据缓存管理器
 *
 * 支持分层刷新策略：
 * - High frequency (5s): Overview
 * - Medium frequency (30s): Services, ECS
 * - Low frequency (5min): EC2
 */
export class DataCache {
  private cache: Map<string, CacheEntry<any>>;

  // 默认 TTL（毫秒）
  private static readonly DEFAULT_TTL = {
    services: 30000, // 30s
    ec2: 300000, // 5min
    ecs: 30000, // 30s
    overview: 5000, // 5s
  };

  constructor() {
    this.cache = new Map();
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const effectiveTtl = ttl ?? this.getDefaultTtl(key);
    this.cache.set(key, {
      data,
      timestamp: new Date(),
      ttl: effectiveTtl,
    });
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp.getTime();
    if (age > entry.ttl) {
      // 缓存过期
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * 检查缓存是否有效
   */
  isValid(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    const age = Date.now() - entry.timestamp.getTime();
    return age <= entry.ttl;
  }

  /**
   * 获取缓存年龄（毫秒）
   */
  getAge(key: string): number | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    return Date.now() - entry.timestamp.getTime();
  }

  /**
   * 清除缓存
   */
  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 清除过期缓存
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp.getTime();
      if (age > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    total: number;
    valid: number;
    expired: number;
    entries: Array<{ key: string; age: number; ttl: number }>;
  } {
    const now = Date.now();
    let valid = 0;
    let expired = 0;
    const entries: Array<{ key: string; age: number; ttl: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp.getTime();
      if (age <= entry.ttl) {
        valid++;
      } else {
        expired++;
      }
      entries.push({
        key,
        age,
        ttl: entry.ttl,
      });
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      entries,
    };
  }

  /**
   * 根据键名推断默认 TTL
   */
  private getDefaultTtl(key: string): number {
    if (key.includes('services')) {
      return DataCache.DEFAULT_TTL.services;
    } else if (key.includes('ec2')) {
      return DataCache.DEFAULT_TTL.ec2;
    } else if (key.includes('ecs')) {
      return DataCache.DEFAULT_TTL.ecs;
    } else if (key.includes('overview')) {
      return DataCache.DEFAULT_TTL.overview;
    } else {
      return 60000; // 默认 1 分钟
    }
  }

  /**
   * 类型安全的缓存访问方法
   */
  getServices(env: string): ServiceHealth[] | null {
    return this.get<ServiceHealth[]>(`services:${env}`);
  }

  setServices(env: string, data: ServiceHealth[], ttl?: number): void {
    this.set(`services:${env}`, data, ttl);
  }

  getEC2(env: string): EC2Stats[] | null {
    return this.get<EC2Stats[]>(`ec2:${env}`);
  }

  setEC2(env: string, data: EC2Stats[], ttl?: number): void {
    this.set(`ec2:${env}`, data, ttl);
  }

  getECS(env: string): ECSServiceStats[] | null {
    return this.get<ECSServiceStats[]>(`ecs:${env}`);
  }

  setECS(env: string, data: ECSServiceStats[], ttl?: number): void {
    this.set(`ecs:${env}`, data, ttl);
  }
}
