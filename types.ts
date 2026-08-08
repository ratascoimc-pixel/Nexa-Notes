export type ProcessingStatus = 'recorded' | 'transcribing' | 'transcribed' | 'notes-ready' | 'error';

export type StudyNotes = {
  title: string;
  mainTheme: string;
  keyPoints: string[];
  references: string[];
  illustrations: string[];
  application: string[];
  reviewQuestions: string[];
  summary: string;
};

export type NexaRecording = {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  segmentUris: string[];
  transcript?: string;
  notes?: StudyNotes;
  pdfUri?: string;
  status: ProcessingStatus;
  error?: string;
};
