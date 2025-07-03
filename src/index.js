import $ from "cash-dom";
import * as nuSlider from "nouislider";
import "nouislider/dist/nouislider.css";

let stream;
let recorder;
let slider;
let recordedChunks = [];

$("#start-btn").on("click", async () => {
    // Start streaming the user's display.
    try {
        stream = await navigator.mediaDevices.getDisplayMedia();
        const videoEl = $("#video")[0];
        videoEl.hidden = false;
        videoEl.srcObject = stream;
    } catch (error) {
        alert(`Could not start screen recording: ${error}`);
        console.error(error);
    }

    // Create the recorder
    recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
        stopRecording().then(() => {
            console.log("stopped");
        });
    };

    recorder.start();

    $("#stop-btn")
        .off("click")
        .on("click", () => {
            recorder.stop();
        });

    $(".start-instructions")[0].hidden = true;
    $("#stop-btn-wrapper")[0].hidden = false;
});

/** Utility function that replaces a button with a loading indicator, runs a callback, 
    reverts the button, and returns the value */
async function runButton($button, cb) {
    const width = $button.outerWidth();
    $button.css("width", width + "px");

    const spinner = $("<sl-spinner></sl-spinner>");
    const originalContent = $button.contents().detach();
    $button.append(spinner);

    await new Promise(requestAnimationFrame);
    let ret;
    try {
        ret = await cb();
    } finally {
        spinner.remove();
        $button.append(originalContent);
        $button.css("width", "")
    }
    await new Promise(requestAnimationFrame);
    return Promise.resolve(ret);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadUrl(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
}

async function stopRecording() {
    console.log("stopping");
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);

    const videoEl = $("video")[0];
    videoEl.srcObject = null;
    videoEl.controls = true;
    videoEl.src = url;
    videoEl.addEventListener("loadedmetadata", () => {
        console.log("Loaded metadata");
        setupEditor(); // only now is videoEl.duration valid
    });

    $("#stop-btn-wrapper")[0].hidden = true;
    $(".download-controls")[0].hidden = false;
    $("#download-webm").on("click", async () => {
        await runButton($("#download-webm"), async () => {
            await downloadUrl(url, "recording.webm")
        });
    });
}

function setupEditor() {
    const videoEl = $("#video")[0];
    let max = videoEl.duration;
    slider = nuSlider.create($("#slider")[0], {
        start: [0, max],
        range: {
            min: 0,
            max: max,
        },
    });

    slider.on("update", (values, handle) => {
        videoEl.currentTime = parseFloat(values[handle]);
    });
}
