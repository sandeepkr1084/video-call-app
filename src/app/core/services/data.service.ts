import { Injectable } from '@angular/core';
import { Message } from '../types/message';
import { WebSocketSubject } from 'rxjs/internal-compatibility';
import { Subject } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';
export const WS_ENDPOINT = "ws://localhost:8081";

@Injectable({
  providedIn: 'root'
})
export class DataService {

  private socket$: WebSocketSubject<Message>;
  private messageSubject = new Subject<Message>();
  public messages$ = this.messageSubject.asObservable();

  constructor() { }

  public connect(): void {
    this.socket$ = this.getNewWebSocket();

    this.socket$.subscribe(
      msg => {
        console.log("Received message of type: "+ msg.type);
        this.messageSubject.next(msg);
      }
    )
  }

  sendMessage(msg: Message): void {
    console.log('sending message: ' + msg.type);
    this.socket$.next(msg);
  }

  private getNewWebSocket(): WebSocketSubject<any> {
    return webSocket({
      url: WS_ENDPOINT,
      openObserver: {
        next: () => {
          console.log("DataService: Connection OK");
        }
      },
      closeObserver: {
        next: () => {
          console.log("DataService: Connection Closed");
          this.socket$ = undefined;
          this.connect();
        }
      }
    });
  }
}