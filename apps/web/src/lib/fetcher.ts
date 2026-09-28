import { api } from './api';

/** SWR fetcher for the Nest API. */
export const fetcher = async (url: string) => {
  const res = await api.get(url);
  return res.data;
};

export { api };
