export const ModelCollectionMap: Record<string, Record<string, string>> = {
  file: {
    statics: 'staticFiles',
  },
  sys: {
    user: 'sys_users',
  },
};

export const ModelFieldsMap: Record<string, Record<string, any>> = {
  file: {
    statics: {
      pages: {
        storeType: 0, // This seems to be a filter/projection in legacy
      },
    },
  },
};
