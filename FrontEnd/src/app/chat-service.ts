import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs';

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  constructor(private http: HttpClient) {}

  streamChat(messages: any[], sessionId: string): Observable<string> {
    return new Observable<string>((obs) => {
      fetch(`${environment.apiUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ messages, sessionId }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          function readStream() {
            reader
              ?.read()
              .then(({ done, value }) => {
                if (done) {
                  obs.complete();
                  return;
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                lines.forEach((line) => {
                  if (line.startsWith('data: ')) {
                    const data = line.substring(6).trim();
                    if (data) {
                      obs.next(data);
                    }
                  }
                });

                readStream();
              })
              .catch((err) => obs.error(err));
          }

          readStream();
        })
        .catch((err) => obs.error(err));
    });
  }

  signIn(): void {
    window.location.href = `${environment.apiUrl}/auth/google`;
  }

  getTodayEvents(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/api/calendar/today`, {
      withCredentials: true,
    });
  }

  checkSession(): Observable<{ authed: boolean; user?: any }> {
    return this.http.get<{ authed: boolean; user?: any }>(
      `${environment.apiUrl}/api/session`,
      { withCredentials: true }
    );
  }

  getSessions(): Observable<ChatSession[]> {
    return this.http.get<ChatSession[]>(`${environment.apiUrl}/api/sessions`, {
      withCredentials: true,
    });
  }

  createSession(
    title: string = 'New Chat'
  ): Observable<{ id: string; title: string }> {
    return this.http.post<{ id: string; title: string }>(
      `${environment.apiUrl}/api/sessions`,
      { title },
      { withCredentials: true }
    );
  }

  getSessionMessages(sessionId: string): Observable<Message[]> {
    return this.http.get<Message[]>(
      `${environment.apiUrl}/api/sessions/${sessionId}/messages`,
      { withCredentials: true }
    );
  }
}
