export const ModelCollectionMap: Record<string, Record<string, string>> = {
  file: {
    statics: 'staticFiles',
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
