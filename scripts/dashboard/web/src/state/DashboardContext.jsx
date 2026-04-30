import React, { createContext, useContext, useReducer } from 'react';
import { reducer, initialState } from './reducer.js';

/** @type {React.Context<{ state: typeof initialState, dispatch: React.Dispatch<any> }>} */
export const DashboardContext = createContext(null);

/**
 * Provider component. Wrap <App> with this to provide dashboard state.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <DashboardContext.Provider value={{ state, dispatch }}>
      {children}
    </DashboardContext.Provider>
  );
}

/** Convenience hook for consuming dashboard state. */
export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within <DashboardProvider>');
  return ctx;
}
