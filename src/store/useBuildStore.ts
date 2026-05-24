import { create } from 'zustand';
import { Build, Item, GemLink } from '../types/build';

interface BuildStoreState {
  currentBuild: Build | null;
  currentBuildPath: string | null; // filesystem path of the open build file
  isDirty: boolean;                // true when there are unsaved changes

  setBuild: (build: Build, path: string) => void;
  updateSkillTree: (allocatedNodes: number[]) => void;
  updateItems: (items: Item[]) => void;
  updateGems: (gems: GemLink[]) => void;
  markDirty: () => void;
  markClean: () => void;
  clearBuild: () => void;
}

export const useBuildStore = create<BuildStoreState>((set, get) => ({
  currentBuild: null,
  currentBuildPath: null,
  isDirty: false,

  setBuild: (build, path) => set({ currentBuild: build, currentBuildPath: path, isDirty: false }),

  updateSkillTree: (allocatedNodes) => {
    const build = get().currentBuild;
    if (!build) return;
    set({
      currentBuild: {
        ...build,
        skill_tree: { ...build.skill_tree, allocated_nodes: allocatedNodes },
        updated_at: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  updateItems: (items) => {
    const build = get().currentBuild;
    if (!build) return;
    set({ currentBuild: { ...build, items, updated_at: new Date().toISOString() }, isDirty: true });
  },

  updateGems: (gems) => {
    const build = get().currentBuild;
    if (!build) return;
    set({ currentBuild: { ...build, gems, updated_at: new Date().toISOString() }, isDirty: true });
  },

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
  clearBuild: () => set({ currentBuild: null, currentBuildPath: null, isDirty: false }),
}));
