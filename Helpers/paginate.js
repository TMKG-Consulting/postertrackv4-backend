async function paginate(model, page, limit, where, include = {}) {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      include, // Pass the include object
      skip,
      take: limit,
    }),
    model.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return { data, total, totalPages };
}

module.exports = { paginate };
