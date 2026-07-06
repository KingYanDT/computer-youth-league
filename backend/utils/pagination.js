/**
 * 解析分页参数。
 * @param {object} query req.query
 * @param {object} [opts]
 * @param {number} [opts.defaultPageSize=20]
 * @param {number} [opts.maxPageSize=200]
 * @returns {{page:number, pageSize:number, offset:number}}
 */
function parsePagination(query, opts = {}) {
  const defaultPageSize = opts.defaultPageSize || 20;
  const maxPageSize = opts.maxPageSize || 200;

  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = parseInt(query.pageSize, 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = defaultPageSize;
  if (pageSize > maxPageSize) pageSize = maxPageSize;

  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * 构造分页响应体。
 * @param {Array} items 当前页数据
 * @param {number} total 总条数
 * @param {{page:number, pageSize:number}} pager parsePagination 的返回
 */
function paginateResponse(items, total, pager) {
  const { page, pageSize } = pager;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1
  };
}

module.exports = { parsePagination, paginateResponse };
