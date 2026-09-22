import { api } from './api';

export const fetcher = async (url: string) => {
  const res = await api.get(url);
  return res.data;
};
