import React from "react";
import socketClient from "socket.io-client";
import * as mediasoup from "mediasoup-client";

import { updateUserInfo } from "./utils/utils";
import { promise } from "./socket-promise/socket-promise";

let socket;
let device;

class App extends React.Component {
  state = {
    device: null,
    users: []
  };

  componentDidMount() {
    socket = socketClient("http://13.127.167.198:3001?meetingId=1234");
    socket.request = promise(socket);

    socket.on("connect", async () => {
      // Get Capabilities of router this client is connected to
      const data = await socket.request("getRouterCapabilities");
      await this.loadDevice(data);
    });

    socket.on("updateConnection", ({ data }) => {
      const updatedUserInfo = updateUserInfo(this.state.users, data);
      this.setState({ users: updatedUserInfo });
    });
  }

  produceTransport = async () => {
    // For sending the media through browser, corresponding transport must be created
    // in the router
    const data = await socket.request("createProducerTransport", {
      forceTcp: false
    });
    if (data.error) {
      console.error(data.error);
      return;
    }
    const transport = device.createSendTransport(data);

    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      socket
        .request("connectProducerTransport", { dtlsParameters, transportId: transport.id })
        .then(callback)
        .catch(errback);
    });

    transport.on(
      "produce",
      async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { id } = await socket.request("produce", {
            transportId: transport.id,
            kind,
            rtpParameters
          });
          callback({ id });
        } catch (err) {
          errback(err);
        }
      }
    );

    transport.on("connectionstatechange", state => {
      switch (state) {
        case "connecting":
          console.log("transport connecting");
          break;

        case "connected":
          console.log("transport connected");
          // document.querySelector("#local_video").srcObject = stream;
          break;

        case "failed":
          console.log("transport close");
          transport.close();
          break;

        default:
          break;
      }
    });

    let stream;
    try {
      // * TODO, second param is a webcam boolean
      stream = await this.getUserMedia(transport, true);
      const track = stream.getVideoTracks()[0];
      document.querySelector("#producer_video").srcObject = stream;
      const params = { track };
      params.encodings = [
        { maxBitrate: 100000 },
        { maxBitrate: 300000 },
        { maxBitrate: 900000 }
      ];
      params.codecOptions = {
        videoGoogleStartBitrate: 1000
      };
      console.log('params', params);
      await transport.produce(params);
    } catch (err) {
      console.log(err);
    }
  };

  consumeTransport = async (userId) => {
    const data = await socket.request("createConsumerTransport", {
      forceTcp: false
    });
    if (data.error) {
      console.error(data.error);
      return;
    }
    const transport = device.createRecvTransport(data);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      socket
        .request("connectConsumerTransport", {
          transportId: transport.id,
          dtlsParameters
        })
        .then(callback)
        .catch(errback);
    });

    transport.on("connectionstatechange", async state => {
      switch (state) {
        case "connecting":
          break;

        case "connected":
          const videoWrapper = this.createNewVideoEle(userId);
          videoWrapper.childNodes[0].srcObject = await stream;
          document.querySelector('#remote_videos').appendChild(videoWrapper);
          await socket.request("resume");
          break;

        case "failed":
          transport.close();
          break;

        default:
          break;
      }
    });

    const stream = this.consume(transport, userId);
  };

  createNewVideoEle = (userId) => {
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;

    const h2 = document.createElement('h2');
    h2.textContent = userId;

    const videoWrapper = document.createElement('div');
    videoWrapper.appendChild(video);
    videoWrapper.appendChild(h2);

    return videoWrapper;
  }

  getUserMedia = async (transport, isWebcam) => {
    if (!device.canProduce("video")) {
      console.error("cannot produce video");
      return;
    }

    let stream;
    try {
      stream = isWebcam
        ? await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          })
        : await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
          });
    } catch (err) {
      console.error("getUserMedia() failed:", err.message);
      throw err;
    }
    return stream;
  };

  async loadDevice(routerRtpCapabilities) {
    try {
      device = new mediasoup.Device();
    } catch (error) {
      if (error.name === "UnsupportedError")
        console.warn("browser not supported");
    }
    await device.load({ routerRtpCapabilities });
  }

  consume = async (transport, userId    ) => {
    const { rtpCapabilities } = device;
    const data = await socket.request("consume", { rtpCapabilities, userId, transportId: transport.id });
    const { producerId, id, kind, rtpParameters } = data;

    let codecOptions = {};
    const consumer = await transport.consume({
      id,
      producerId,
      kind,
      rtpParameters,
      codecOptions
    });
    const stream = new MediaStream();
    stream.addTrack(consumer.track);
    return stream;
  };

  render() {
    return (
      <>
        <div onClick={this.produceTransport} className="App">
          Be a Producer, {socket && socket.id}
        </div>
        {this.state.users.map((user) => (
          user.id !== socket.id && <div key={user.id} onClick={() => this.consumeTransport(user.id)} className="App">
            <h4>Be a Consumer, {user.id}</h4>
          </div>
        ))}
        
        <video autoPlay id="producer_video"></video>
        <div id="remote_videos">

        </div>
      </>
    );
  }
}

export default App;
