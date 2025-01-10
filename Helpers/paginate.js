const paginate = async (model, page, limit, filter = {}) => {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    model.findMany({
      skip,
      take: limit,
      where: filter, // Apply filters if necessary
    }),
    model.count({ where: filter }),
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
};

module.exports = { paginate };
