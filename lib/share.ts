import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export async function shareAudioFile(uri: string, title: string, part: number, total: number) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('This saved audio file could not be found.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, {
    mimeType: 'audio/mp4',
    dialogTitle: total > 1 ? `Share ${title} — audio part ${part} of ${total}` : `Share ${title} audio`,
  });
}
