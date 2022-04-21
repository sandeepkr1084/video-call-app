import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DataService } from '../core/services/data.service';
import { Message } from '../core/types/message';

const mediaConstraints = {
  audio: true,
  video: {width: 720, height: 540}
}
const offerOptions = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
}
@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements AfterViewInit {

  private localStream: MediaStream;
  @ViewChild('local_video') localVideo: ElementRef;
  @ViewChild('received_video') remoteVideo: ElementRef;

  private peerConnection: RTCPeerConnection;
  constructor(
    private dataService: DataService
  ) { }

  ngAfterViewInit(): void {
    this.addIncomingMessageHandler();
    this.requestMediaDevices();
  }

  private async requestMediaDevices(): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    this.pauseLocalVideo();
  }

  pauseLocalVideo(): void {
    this.localStream.getTracks().forEach(track => {
      track.enabled = false;
    });
    this.localVideo.nativeElement.srcObject = undefined;
  }
  startLocalVideo(): void {
    this.localStream.getTracks().forEach(track => {
      track.enabled = true;
    });
    this.localVideo.nativeElement.srcObject = this.localStream;
  }

  async call(): Promise<void> {
    this.createPeerConnection();

    this.localStream.getTracks().forEach( 
      track => this.peerConnection.addTrack(track, this.localStream)
    );

    try {
      const offer: RTCSessionDescriptionInit = await this.peerConnection.createOffer(offerOptions);
      await this.peerConnection.setLocalDescription(offer);
      
      this.dataService.sendMessage({type: 'offer', data: offer})
    } catch (err) {
      this.handleGetUserMediaError(err);
    }
  }

  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: ['stun:stun.kundenserver.de:3478']
        }
      ]
    });
    this.peerConnection.onicecandidate = this.handleICECandidateEvent;
    this.peerConnection.onicegatheringstatechange = this.handleIceConnectionStateChangeEvent;
    this.peerConnection.onsignalingstatechange = this.handleSignalingStateEvent;
    this.peerConnection.ontrack = this.handleTrackEvent;

  }

  private closeVideoCall(): void {
    if(this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onicegatheringstatechange = null;
      this.peerConnection.onsignalingstatechange = null;
      this.peerConnection.ontrack = null;
    }

    this.peerConnection.getTransceivers().forEach(transceiver => {
      transceiver.stop();
    });
    this.peerConnection.close();
    this.peerConnection = null;
  }
  private handleGetUserMediaError(err): void {
    switch(err.name) {
      case 'NotFoundError':
        alert('unable to open your call because no camera and/or microphone found');
        break;
      case 'SecurityError':
      case 'PermissionDeniedError':
        break;
      default:
        console.log(err);
        alert('error opening your camera');
        break;
    }
    this.closeVideoCall();
  }

  private handleICECandidateEvent = (event: RTCPeerConnectionIceEvent) => {
    console.log(event);
    if(event.candidate) {
      this.dataService.sendMessage({
        type: 'ice-candidate',
        data: event.candidate
      })
    }
  }
  private handleIceConnectionStateChangeEvent = (event: Event) => {
    console.log(event);
    switch(this.peerConnection.iceConnectionState) {
      case 'closed': 
      case 'failed':
      case 'disconnected':
        this.closeVideoCall();
        break;
    }
  }
  private handleSignalingStateEvent = (event: Event) => {
    console.log(event);
    switch(this.peerConnection.signalingState) {
      case 'closed':
        this.closeVideoCall();
        break;
    }
  }
  private handleTrackEvent = (event: RTCTrackEvent) => {
    console.log(event);
    this.remoteVideo.nativeElement.srcObject = event.streams[0];

  }
  private addIncomingMessageHandler() {
    this.dataService.connect();

    this.dataService.messages$.subscribe(
      msg => {
        switch(msg.type) {
          case 'offer':
            this.handleOfferMessage(msg.data);
            break;
          case 'answer': 
            this.handleAnswerMessage(msg.data);
            break;
          case 'hangup':
            this.handleHangupMessage(msg);
            break;
          case 'ice-candidate':
            this.handleICECandidateMessage(msg.data);
            break;
          default:
            console.log('unknown message of type: '+msg.type);
        }
      },
      error => {
        console.log(error);
      }
    );
  }
  private handleOfferMessage(msg: RTCSessionDescriptionInit): void {
    if(!this.peerConnection) {
      this.createPeerConnection();
    }
    if(this.localStream) {
      this.startLocalVideo();
    }
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg))
      .then(() => {
        this.localVideo.nativeElement.srcObject = this.localStream;

        this.localStream.getTracks().forEach(
          track => this.peerConnection.addTrack(track, this.localStream)
        );
      }).then(() => {
        return this.peerConnection.createAnswer();
      }).then((answer) => {
        return this.peerConnection.setLocalDescription(answer);
      }).then(() => {
        this.dataService.sendMessage({type: 'answer', data: this.peerConnection.localDescription});
      }).catch(this.handleGetUserMediaError);
  }
  private handleAnswerMessage(data): void{
    this.peerConnection.setRemoteDescription(data);
  }
  private handleHangupMessage(msg: Message): void {
    this.closeVideoCall();
  }
  private handleICECandidateMessage(data): void {
    this.peerConnection.addIceCandidate(data).catch(this.reportError);
  }
  private reportError = (e: Error) => {
    console.log('got Error: ' + e.name);
    console.log(e);
  }

  hangUp(): void {
    this.dataService.sendMessage({type: 'hangup', data: ''});
    this.closeVideoCall();
  }
}
