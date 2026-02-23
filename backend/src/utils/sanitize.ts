// 过滤API密钥等敏感信息
export function sanitizeForLog(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = [
    'authorization',
    'apiKey',
    'accessKey',
    'password',
    'token',
    'secret',
    'credential'
  ];

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      (sanitized as any)[key] = '***REDACTED***';
    } else if (typeof (sanitized as any)[key] === 'object') {
      (sanitized as any)[key] = sanitizeForLog((sanitized as any)[key]);
    }
  }

  return sanitized;
}

// 内容安全过滤（检查敏感内容）
export async function contentSafetyCheck(content: string): Promise<boolean> {
  // 可接入内容审核API
  // 这里简化处理
  const sensitiveWords: string[] = [];
  return !sensitiveWords.some(word => content.includes(word));
}

// 清理HTML标签
export function sanitizeHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

// 限制字符串长度
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}
