import path from 'node:path';

/** 部署时可指定独立数据目录，更新代码不覆盖用户数据。 */
export const DATA_DIR = path.resolve(process.env.XIAN_DATA_DIR || path.join(process.cwd(), 'data'));
