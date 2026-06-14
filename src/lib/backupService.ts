import { supabase } from './supabase';
import { HistoryRecord } from '../types';

export const exportHistoryAsJSON = (history: HistoryRecord[]) => {
  const dataStr = JSON.stringify(history, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_faturas_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const uploadBackupToSupabase = async (history: HistoryRecord[], userId: string) => {
  if (!supabase) throw new Error('Supabase not initialized');
  
  const fileName = `backups/${userId}/backup_${Date.now()}.json`;
  const fileBody = JSON.stringify(history, null, 2);
  
  // Create a blob for the file
  const blob = new Blob([fileBody], { type: 'application/json' });

  // Upload to 'invoices' bucket (assuming it exists or using a generic one)
  const { data, error } = await supabase.storage
    .from('backups')
    .upload(fileName, blob, {
      upsert: true
    });

  if (error) {
    // If bucket doesn't exist, this might fail. We should ideally check or just report error.
    console.error('Backup upload error:', error);
    throw error;
  }
  
  return data;
};
