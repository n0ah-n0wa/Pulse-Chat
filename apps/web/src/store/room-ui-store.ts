import { create } from 'zustand';

interface RoomUiState {
  readonly currentRoomId: string | null;
  readonly isRoomNavOpen: boolean;
  readonly isMemberPanelOpen: boolean;
  readonly isNotificationPanelOpen: boolean;
  readonly setCurrentRoomId: (roomId: string | null) => void;
  readonly openRoomNav: () => void;
  readonly closeRoomNav: () => void;
  readonly openMemberPanel: () => void;
  readonly closeMemberPanel: () => void;
  readonly openNotificationPanel: () => void;
  readonly closeNotificationPanel: () => void;
}

export const useRoomUiStore = create<RoomUiState>((set) => ({
  currentRoomId: null,
  isRoomNavOpen: false,
  isMemberPanelOpen: false,
  isNotificationPanelOpen: false,
  setCurrentRoomId: (roomId) => {
    set({ currentRoomId: roomId });
  },
  openRoomNav: () => {
    set({ isRoomNavOpen: true, isMemberPanelOpen: false, isNotificationPanelOpen: false });
  },
  closeRoomNav: () => {
    set({ isRoomNavOpen: false });
  },
  openMemberPanel: () => {
    set({ isMemberPanelOpen: true, isRoomNavOpen: false, isNotificationPanelOpen: false });
  },
  closeMemberPanel: () => {
    set({ isMemberPanelOpen: false });
  },
  openNotificationPanel: () => {
    set({ isNotificationPanelOpen: true, isRoomNavOpen: false, isMemberPanelOpen: false });
  },
  closeNotificationPanel: () => {
    set({ isNotificationPanelOpen: false });
  },
}));
