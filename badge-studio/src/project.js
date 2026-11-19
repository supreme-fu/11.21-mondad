import { createScene } from './scene.js';

export function createProject() {
  return {
    id: 'do-something-badge-studio',
    name: 'Do Something 生活徽章收藏室',
    defaultSceneId: 'main',
    scenes: [{ id: 'main', name: '生活徽章收藏室', createScene }],
  };
}
