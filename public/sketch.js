let socket;
let peerConnection;
let videoLocal, videoRemote;
let startCallButton;

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

function setup() {
  createCanvas(640, 480);
  background(50);

  console.log("Test 513");
  // Botón para iniciar la llamada
  startCallButton = createButton('Iniciar Llamada');
  startCallButton.position(10, height + 10);
  startCallButton.mousePressed(startCall);

  // Conexión con Socket.IO
  socket = io();

  // Señalización: recibir oferta
  socket.on('offer', async (offer) => {
    console.log('Oferta recibida:', offer);
    console.log('SDP Oferta Recibida (Original):', offer.sdp); // Log original SDP Offer
    if (!peerConnection) {
      createPeerConnection();
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();

    // Force VP8 codec in SDP Answer
    const modifiedAnswerSdp = forceVP8Codec(answer.sdp);
    const modifiedAnswer = new RTCSessionDescription({ type: answer.type, sdp: modifiedAnswerSdp });

    console.log('SDP Respuesta Creada (Original):', answer.sdp); // Log original SDP Answer
    console.log('SDP Respuesta Creada (VP8 Forced):', modifiedAnswerSdp); // Log modified SDP Answer
    await peerConnection.setLocalDescription(modifiedAnswer);
    socket.emit('answer', modifiedAnswer);
  });

  // Señalización: recibir respuesta
  socket.on('answer', async (answer) => {
    console.log('Respuesta recibida:', answer);
    console.log('SDP Respuesta Recibida (Original):', answer.sdp); // Log original SDP Answer
    console.log('SDP Respuesta Recibida (VP8 Forced - should be same as created):', answer.sdp); // Log - should be same as created if forced correctly
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  // Señalización: recibir candidatos ICE
  socket.on('candidate', async (candidate) => {
    console.log('Candidato recibido:', candidate);
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error agregando candidato ICE:', e);
    }
  });

  // Video local: usamos createCapture de p5.js
  videoLocal = createCapture(VIDEO, () => {
    console.log('Video local listo.');
  });
  videoLocal.size(320, 240);
  videoLocal.hide(); // Se dibuja en el canvas

  // Video remoto: obtenemos el elemento definido en index.html
  videoRemote = document.getElementById('remoteVideo');
  if (!videoRemote) {
    console.error("Error en setup(): No se encontró el elemento video remoto con ID 'remoteVideo' en el HTML.");
  } else {
    console.log("Elemento video remoto encontrado en setup():", videoRemote); // Log in setup
  }
}

function draw() {
  background(50);

  // Draw local video
  if (videoLocal && videoLocal.elt && videoLocal.elt.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    image(videoLocal, 0, height / 2, width / 2, height / 2);
    fill(255);
    text('Local', 10, height / 2 + 20);
  }

  // Draw remote video - directly checking readyState in draw()
  if (videoRemote && videoRemote.srcObject && videoRemote.readyState >= HTMLMediaElement.HAVE_METADATA) {
    image(videoRemote, width / 2, height / 2, width / 2, height / 2);
    fill(255);
    text('Remoto', width / 2 + 10, height / 2 + 20);
  } else {
    let reasons = [];
    if (!videoRemote) reasons.push("videoRemote is null/undefined");
    if (!videoRemote?.srcObject) reasons.push("videoRemote.srcObject is null/undefined");
    if (videoRemote && videoRemote.readyState < HTMLMediaElement.HAVE_METADATA) reasons.push(`readyState < HAVE_METADATA (${videoRemote.readyState})`);

    console.log("No dibujando video remoto en draw()..., razones: " + reasons.join(", "));
    fill(200); // Grey color to indicate not ready
    text('Remoto (Cargando Metadata)', width / 2 + 10, height / 2 + 20);
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  // Agregar las pistas del stream local a la conexión
  if (videoLocal && videoLocal.elt && videoLocal.elt.srcObject) {
    let stream = videoLocal.elt.srcObject;
    stream.getTracks().forEach(track => {
      peerConnection.addTrack(track, stream);
    });
  }

  // Al recibir una pista remota, asignar el stream al elemento videoRemote
  peerConnection.ontrack = (event) => {
    console.log('Recibiendo stream remoto:', event.streams[0]);
    console.log('Pistas del stream remoto:', event.streams[0].getTracks());
    event.streams[0].getTracks().forEach(track => {
      console.log("  Remote Track - kind:", track.kind, ", readyState:", track.readyState, ", id:", track.id);
    });

    videoRemote.srcObject = event.streams[0];
    console.log("Estado de readyState justo después de asignar srcObject:", videoRemote.readyState);

    // No necesitamos onloadedmetadata handler anymore in this version

    // (Optional) Initial play attempt - might not be needed with direct readyState check
    videoRemote.play()
      .then(() => console.log("Initial remote video playback attempt after srcObject set."))
      .catch(err => console.error("Error in initial remote video playback attempt:", err));
  };

  // Enviar candidatos ICE al otro extremo
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('candidate', event.candidate);
    }
  };
}

async function startCall() {
  if (!peerConnection) {
    createPeerConnection();
  }
  const offer = await peerConnection.createOffer();

  // Force VP8 codec in SDP Offer
  const modifiedOfferSdp = forceVP8Codec(offer.sdp);
  const modifiedOffer = new RTCSessionDescription({ type: offer.type, sdp: modifiedOfferSdp });


  console.log('SDP Oferta Creada (Original):', offer.sdp); // Log original SDP Offer
  console.log('SDP Oferta Creada (VP8 Forced):', modifiedOfferSdp); // Log modified SDP Offer

  await peerConnection.setLocalDescription(modifiedOffer);
  socket.emit('offer', modifiedOffer);
}


function forceVP8Codec(sdp) {
  let lines = sdp.split('\r\n');
  let mLineIndex = -1;

  // Find the m=video line
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('m=video')) {
      mLineIndex = i;
      break;
    }
  }

  if (mLineIndex === -1) {
    return sdp; // No video media line found
  }

  // Create a new array for modified lines
  let modifiedLines = [];
  for (let i = 0; i < lines.length; i++) {
    modifiedLines.push(lines[i]);
  }

  // Keep only VP8-related lines and related RTX/RTCP-FB for VP8
  const vp8PayloadType = '96'; // Payload type for VP8 from your SDP
  const vp8RTXPayloadType = '97'; // Payload type for RTX of VP8 from your SDP (apt=96)

  let keptPayloadTypes = [vp8PayloadType, vp8RTXPayloadType];
  let newMLine = lines[mLineIndex].split(" ").slice(0, 4).concat(keptPayloadTypes).join(" "); // Keep UDP/TLS/RTP/SAVPF and VP8 PTs
  modifiedLines[mLineIndex] = newMLine;


  // Filter out rtpmap, rtcp-fb, fmtp lines that are NOT for VP8 or VP8 RTX
  modifiedLines = modifiedLines.filter(line => {
      if (line.startsWith('a=rtpmap:') || line.startsWith('a=rtcp-fb:') || line.startsWith('a=fmtp:')) {
          const payloadType = line.split(':')[1].split(' ')[0]; // Extract payload type
          return keptPayloadTypes.includes(payloadType);
      }
      return true; // Keep other lines
  });


  return modifiedLines.join('\r\n');
}
