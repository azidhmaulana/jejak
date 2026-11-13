// Capture the owner when the controller is created, including its final logout flush.
export function localDrawingStorage(owner: string) {
  const prefix = `jejak-drawing:${encodeURIComponent(owner)}:`;
  return {
    getItem: (key: string) => localStorage.getItem(prefix + key),
    setItem: (key: string, value: string) => localStorage.setItem(prefix + key, value),
  };
}
