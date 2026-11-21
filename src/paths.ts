/** 应用内地址跟随 Vite base；开发时为 /，子路径部署时为 /unforeseen-life/。 */
export function appUrl(path: string): string {
  // 上传预览、内嵌图片及外部地址不添加部署前缀。
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;

  const base = import.meta.env.BASE_URL;
  // 避免已带前缀的证物地址被重复转换。
  if (base !== '/' && path.startsWith(base)) return path;
  return `${base}${path.replace(/^\/+/, '')}`;
}

export const API_BASE = appUrl('api');
