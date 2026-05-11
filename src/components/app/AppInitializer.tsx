'use client';

import { useEffect } from 'react';
import { migrateFromLocalStorage } from '@/lib/migrate';

/**
 * 应用初始化组件：在客户端挂载时触发数据迁移
 */
export function AppInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    migrateFromLocalStorage().catch((err) => {
      console.error('[AppInitializer] Migration error:', err);
    });
  }, []);

  return <>{children}</>;
}
