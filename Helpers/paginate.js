const PAGE_SIZE = 50;

async function paginate(model, page, limit, where, include, orderBy = {}) {
  limit = PAGE_SIZE;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      include, // Pass the include object
      skip,
      take: limit,
      orderBy,
    }),
    model.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return { data, total, totalPages };
}

// Helpers/paginate.js
const campaignPaginate = async (model, page, limit, options = {}) => {
  limit = PAGE_SIZE;
  const skip = (page - 1) * limit;

  // Extract `where` filter from options
  const { where, include, ...restOptions } = options;

  // Fetch paginated results
  const [data, total] = await Promise.all([
    model.findMany({
      skip,
      take: limit,
      where, // Apply where clause if provided
      include, // Apply include clause if provided
      ...restOptions,
    }),
    model.count({
      where, // Only use where for count
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return { data, total, totalPages };
};

module.exports = { paginate, campaignPaginate, PAGE_SIZE };
