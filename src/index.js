import $ from "cash-dom";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import * as nuSlider from "nouislider";
import "nouislider/dist/nouislider.css";

let stream;
let recorder;
let slider;
let recordedChunks = [];

if (
    !navigator.mediaDevices?.getDisplayMedia ||
    !MediaRecorder ||
    !MediaRecorder.isTypeSupported("video/webm")
) {
    $("#start-btn")[0].disabled = true;
    $("#unsupported-message")[0].hidden = false;
} else if (!WebAssembly) {
    $(".helper-text").text(
        "Your browser does not support editing or converting video files, so you can only download the webm file. Use Chrome or Firefox, or update your browser for the best experience.",
    );
    $("#download-mp4")[0].disabled = true;
    $("#download-gif").disabled = true;
    $("#trim-video").disabled = true;
    $("#slider").hide();
}

const ffmpegInstance = new FFmpeg();
ffmpegInstance.on("log", ({ type, message }) => {
    console.debug(`[ffmpeg ${type}]: ${message}`);
});

async function loadFFmpeg() {
    if (ffmpegInstance.loaded) return ffmpegInstance;
    console.log("started loading ffmpeg");
    console.time("Loading ffmpeg");
    await ffmpegInstance.load();
    console.timeEnd("Loading ffmpeg");
    return ffmpegInstance;
}

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

    window.requestIdleCallback(loadFFmpeg);

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
        $button.css("width", "");
    }
    await new Promise(requestAnimationFrame);
    return Promise.resolve(ret);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadUrl(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
}

async function downloadMp4(url) {
    let ffmpeg = await loadFFmpeg();
    let res = await fetch(url);

    await ffmpeg.writeFile("input.webm", new Uint8Array(await res.bytes()));
    console.time("Converting to mp4");
    await ffmpeg.exec([
        "-i",
        "input.webm",
        "-preset",
        "ultrafast",
        "output.mp4",
    ]);
    console.timeEnd("Converting to mp4");

    let data = await ffmpeg.readFile("output.mp4");
    let outputUrl = URL.createObjectURL(
        new Blob([data], { type: "video/mp4" }),
    );
    return downloadUrl(outputUrl, "recording.mp4");
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
            await downloadUrl(url, "recording.webm");
        });
    });

    $("#download-mp4").on("click", async () => {
        await runButton($("#download-mp4"), async () => {
            await downloadMp4(url);
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
