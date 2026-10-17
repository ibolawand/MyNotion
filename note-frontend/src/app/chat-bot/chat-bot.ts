import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  time: number;
}

@Component({
  selector: 'app-chat-bot',
  imports: [FormsModule],
  templateUrl: './chat-bot.html',
  styleUrl: './chat-bot.css'
})
export class ChatBot {
  isOpen = false;
  input = '';
  navigationEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];

  messages: ChatMessage[] = [
    { role: 'assistant', text: 'Hi! I\'m your assistant. How can I help?', time: Date.now() }
  ];
  constructor(private http: HttpClient) {

  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => this.scrollToBottom(), 0);
      if (this.navigationEntries.length > 0 && this.navigationEntries[0].type === "reload") {
        this.http.patch("/chat/reload", {
        }).subscribe(res => {
          console.log("einstein")
        })
      } else {
        console.log("Fresh load or navigation.");
      }
    }
  }

  send() {
    const text = this.input.trim();
    if (!text) return;

    this.messages.push({ role: 'user', text, time: Date.now() });
    this.input = '';
    this.scrollToBottom();
    this.http.post('http://localhost:3000/api/chat', {
      username: "einstein",
      content: text
    }).subscribe({
      next: (res: any) => {
        console.log(res);
        this.messages.push({ role: 'assistant', text: res.reply, time: Date.now() });
      }
    })
  }

  private scrollToBottom() {
    const panel = document.querySelector('.assistant-panel .messages');
    if (panel) panel.scrollTop = panel.scrollHeight;
  }
}
