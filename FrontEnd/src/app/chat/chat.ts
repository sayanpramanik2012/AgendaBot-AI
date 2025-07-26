import { Component, signal, OnInit } from '@angular/core';
import { ChatService, ChatSession, Message } from '../chat-service';

interface UIMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-chat',
  standalone: false,
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat implements OnInit {
  messages = signal<UIMessage[]>([]);
  input = '';
  private history: any[] = [];
  isAuthed = false;
  user: any = null;
  sessions = signal<ChatSession[]>([]);
  currentSessionId = signal<string | null>(null);
  showSessions = signal(false);
  isLoading = false;

  // Add these methods
  trackSession(index: number, session: ChatSession): string {
    return session.id;
  }

  trackMessage(index: number, message: UIMessage): string {
    return index.toString(); // or use a unique message ID if available
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getCurrentSessionTitle(): string {
    const currentSession = this.sessions().find(
      (s) => s.id === this.currentSessionId()
    );
    return currentSession?.title || 'Chat';
  }
  constructor(private svc: ChatService) {}

  ngOnInit() {
    this.svc.checkSession().subscribe(({ authed, user }) => {
      this.isAuthed = authed;
      this.user = user;
      if (authed) {
        this.loadSessions();
      }
    });
  }

  authed() {
    return this.isAuthed;
  }

  signIn() {
    this.svc.signIn();
  }

  loadSessions() {
    this.svc.getSessions().subscribe((sessions) => {
      this.sessions.set(sessions);
      if (sessions.length > 0 && !this.currentSessionId()) {
        this.loadSession(sessions[0].id);
      }
    });
  }

  createNewSession() {
    this.svc.createSession().subscribe((session) => {
      this.currentSessionId.set(session.id);
      this.messages.set([]);
      this.history = [];
      this.loadSessions(); // Refresh sessions list
    });
  }

  loadSession(sessionId: string) {
    this.currentSessionId.set(sessionId);
    this.svc.getSessionMessages(sessionId).subscribe((messages) => {
      const uiMessages = messages.map((msg) => ({
        role: msg.role,
        text: msg.content,
      }));
      this.messages.set(uiMessages);
      this.history = uiMessages.map((msg) => ({
        role: msg.role,
        text: msg.text,
      }));
    });
  }

  toggleSessions() {
    this.showSessions.update((show) => !show);
  }

  send() {
    if (!this.currentSessionId()) {
      this.svc.createSession().subscribe((session) => {
        this.currentSessionId.set(session.id);
        this.loadSessions();
        this.sendMessage();
      });
      return;
    }
    this.sendMessage();
  }

  private sendMessage() {
    this.isLoading = true;

    const userMsg: UIMessage = { role: 'user', text: this.input };
    this.history.push(userMsg);
    this.messages.update((m) => [...m, userMsg]);
    this.input = '';

    let lastAssistantIdx = this.messages().length;
    this.messages.update((m) => [...m, { role: 'assistant', text: '' }]);

    let completeResponse = '';

    this.svc.streamChat(this.history, this.currentSessionId()!).subscribe({
      next: (chunk) => {
        try {
          const data = JSON.parse(chunk);
          if (data.text) {
            completeResponse += data.text;
            this.messages.update((m) => {
              const arr = [...m];
              arr[lastAssistantIdx].text += data.text;
              return arr;
            });
          }
          if (data.complete) {
            this.history.push({ role: 'assistant', text: completeResponse });
            this.isLoading = false;
          }
        } catch (e) {
          console.warn('Failed to parse chunk:', chunk);
        }
      },
      complete: () => {
        this.isLoading = false;
        if (
          completeResponse &&
          !this.history.some(
            (h) => h.role === 'assistant' && h.text === completeResponse
          )
        ) {
          this.history.push({ role: 'assistant', text: completeResponse });
        }
      },
      error: (e) => {
        console.error('Stream error:', e);
        this.isLoading = false;
      },
    });
  }

  loadEvents() {
    this.svc.getTodayEvents().subscribe((events: any[]) => {
      if (events.length === 0) {
        const noEventsMsg = 'You have no events scheduled for today.';
        this.history.push({ role: 'assistant', text: noEventsMsg });
        this.messages.update((m) => [
          ...m,
          { role: 'assistant', text: noEventsMsg },
        ]);
        return;
      }

      const eventDetails = events
        .map((event) => {
          const startTime = event.start?.dateTime || event.start?.date;
          const endTime = event.end?.dateTime || event.end?.date;
          const location = event.location ? ` at ${event.location}` : '';
          const description = event.description
            ? ` - ${event.description}`
            : '';

          return `${event.summary} from ${new Date(
            startTime
          ).toLocaleTimeString()} to ${new Date(
            endTime
          ).toLocaleTimeString()}${location}${description}`;
        })
        .join('\n');

      const aiContext = `Here are today's calendar events:\n${eventDetails}\n\nYou can now answer questions about these events.`;
      const displaySummary = `Today's Events:\n${events
        .map(
          (e) =>
            `• ${e.summary} at ${new Date(
              e.start?.dateTime || e.start?.date
            ).toLocaleTimeString()}`
        )
        .join('\n')}`;

      this.history.push({ role: 'assistant', text: aiContext });
      this.messages.update((m) => [
        ...m,
        { role: 'assistant', text: displaySummary },
      ]);
    });
  }
}
