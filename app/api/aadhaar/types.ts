export interface AadhaarResponse {
  success: boolean;
  data?: {
    uid: string;
    name: string;
    gender: string;
    yob: string;
    co: string;
    vtc: string;
    po: string;
    dist: string;
    state: string;
    pc: string;
    photo?: string | null;
  };
  error?: string;
  message?: string;
}