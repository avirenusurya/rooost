import { createContext, useContext, type MouseEvent } from 'react';

export type MenuTarget =
  | { kind: 'card'; id: string }
  | { kind: 'column'; id: string; onRename: () => void }
  | { kind: 'board'; id: string };

type OpenMenu = (event: MouseEvent, target: MenuTarget) => void;

export const ContextMenuContext = createContext<OpenMenu>(() => undefined);
export const useOpenContextMenu = () => useContext(ContextMenuContext);
