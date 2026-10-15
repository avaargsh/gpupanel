import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './index';

/** 类型安全的 dispatch / selector（Redux Toolkit + react-redux v9） */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
