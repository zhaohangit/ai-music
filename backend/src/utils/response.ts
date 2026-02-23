import { Response } from 'express';
import { ApiResponse } from '../types/errors';
import { v4 as uuidv4 } from 'uuid';

// 生成请求ID
export function generateRequestId(): string {
  return uuidv4();
}

// 成功响应
export function success<T>(res: Response, data: T, statusCode = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId || generateRequestId(),
    }
  };
  return res.status(statusCode).json(response);
}

// 失败响应
export function fail(
  res: Response,
  code: number,
  message: string,
  statusCode = 400,
  details?: any
) {
  const response: ApiResponse<null> = {
    success: false,
    error: { code, message, details },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId || generateRequestId(),
    }
  };
  return res.status(statusCode).json(response);
}

// 分页响应
export function paginated<T>(
  res: Response,
  data: T[],
  page: number,
  pageSize: number,
  total: number
) {
  return success(res, {
    items: data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  });
}
