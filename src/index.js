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

let vidDuration = -1;
let avgSpeed = -1;
let speedSamples = -1;
let progress = -1;
let pb = $("#progress-bar");

ffmpegInstance.on("log", ({ type, message }) => {
    console.debug(`[ffmpeg ${type}]: ${message}`);
    if (type == "stderr" && message.startsWith("frame=")) {
        const timeMatch = message.match(/time=(\d+:\d+:\d+\.\d+)/);
        const speedMatch = message.match(/speed=([\d.]+)x/);
        if (!timeMatch || !speedMatch) return null;

        if (vidDuration == -1) {
            vidDuration = $("#video")[0].duration;
        }

        let [hh, mm, ss] = timeMatch[1].split(":");
        let elapsed = parseFloat(hh) * 3600 + parseFloat(mm) * 60 + parseFloat(ss);

        let speed = parseFloat(speedMatch[1]);
        let estimatedTotal;
        if (elapsed > 2) {
            if (avgSpeed == -1) {
                avgSpeed = speed;
                speedSamples = 1;
            } else {
                avgSpeed = (speedSamples * avgSpeed + speed) / (++speedSamples);
            }

            estimatedTotal = vidDuration / avgSpeed;

        } else {
            speed = 0.7
        }

        let percent = elapsed / estimatedTotal;
        if (percent > progress) {
            progress = percent;
            pb.attr("value", percent * 100)
            pb[0].indeterminate = false;
        }

    } else if (type == "stderr" && message.startsWith("Aborted")) {
        console.log("got aborted");
        vidDuration = -1;
        avgSpeed = -1;
        speedSamples = -1;
        pb.attr("value", 100)
    }
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
async function runButton($button, cb, showProgress = true, name = undefined) {
    const width = $button.outerWidth();
    $button.css("width", width + "px");

    const spinner = $("<sl-spinner></sl-spinner>");
    const originalContent = $button.contents().detach();

    $button.append(spinner);
    if (showProgress) {
        if (name) {
            $("#progress-dialog").attr("label", name);
        }
        $("#progress-dialog").show();
    }
    await new Promise(requestAnimationFrame);
    let ret;
    try {
        ret = await cb();
    } finally {
        spinner.remove();
        $button.append(originalContent);
        $button.css("width", "");
    }

    if (showProgress) {
        setTimeout(() => {
            if (name) {
                $("#progress-dialog").attr("label", "Performing operation");
            }

            $("#progress-dialog").hide();

        }, 3000);
    }

    await new Promise(requestAnimationFrame);
    return Promise.resolve(ret);
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

async function trimVideo(url, setting) {
    const ffmpeg = await loadFFmpeg();
    const res = await fetch(url);
    const sliderValues = slider.get().map((v) => parseFloat(v));

    await ffmpeg.writeFile(
        "input.webm",
        new Uint8Array(await res.bytes()),
    );
    console.time("Trimming video");
    if (setting == "better") {
        await ffmpeg.exec([
            "-ss",
            sliderValues[0].toFixed(2),
            "-i",
            "input.webm",
            "-t",
            (sliderValues[1] - sliderValues[0]).toFixed(2),
            "-vf",
            "scale=1280:-1",
            "-c:v",
            "libvpx",
            "-crf",
            "15",
            "-b:v",
            "1500k",
            "-speed",
            "2",
            "-c:a",
            "libvorbis",
            "output.webm",
        ]);

    } else {
        await ffmpeg.exec([
            "-ss",
            sliderValues[0].toFixed(2),
            "-i",
            "input.webm",
            "-t",
            (sliderValues[1] - sliderValues[0]).toFixed(2),
            "-vf",
            "scale=1280:-1",
            "-c:v",
            "libvpx",
            "-crf",
            "30",
            "-b:v",
            "500k",
            "-speed",
            "8",
            "-an",
            "output.webm",
        ]);
    }
    console.timeEnd("Trimming video");

    let data = await ffmpeg.readFile("output.webm");
    let blob = new Blob([data], { type: "video/webm" });
    return URL.createObjectURL(blob);
}

async function stopRecording() {
    console.log("stopping");
    stream.getTracks().forEach((track) => track.stop());
    let blob = new Blob(recordedChunks, { type: "video/webm" });
    let url = URL.createObjectURL(blob);

    const videoEl = $("#video")[0];
    videoEl.autoplay = false;
    videoEl.addEventListener("loadedmetadata", async () => {
        console.log("Loaded metadata");
        await setupEditor(); // only now is videoEl.duration valid
    });

    videoEl.srcObject = null;
    videoEl.controls = true;
    videoEl.src = url;

    $("#stop-btn-wrapper")[0].hidden = true;
    $(".download-controls")[0].hidden = false;
    $("#trim-video").on("click", () => {
        $("#trim-dialog")[0].show()
        $("#trim-start").on("click", async () => {
            let setting = $("#trim-setting").val();
            if (setting) {
                runButton($("#trim-start"), async () => {
                    $("#trim-dialog").hide();
                    await new Promise(requestAnimationFrame);

                    url = await trimVideo(url, setting);
                    videoEl.src = url;
                    videoEl.currentTime = 0;
                }, true, "Trimming video")
            }
        })
    });

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

async function setupEditor() {
    console.log("loading editor")
    const videoEl = $("#video")[0];

    let max = videoEl.duration;
    // Chrome does not store video duration in the metadata,
    // so we need to forcibly load it by subscribing to "timeupdate" and scrubbing past the end of the video 
    if (max === Infinity) {
        max = await new Promise((resolve) => {
            let pb = $("#progress-dialog");
            pb.attr("label", "Loading video")
            pb[0].show();
            function getDuration() {
                let duration = videoEl.duration;
                console.log(duration);
                videoEl.removeEventListener('timeupdate', getDuration)
                videoEl.currentTime = 0;
                resolve(duration);
            }

            videoEl.addEventListener('timeupdate', getDuration);
            videoEl.currentTime = 1e101
        });

        $("#progress-dialog").hide();
        await new Promise(requestAnimationFrame);
        $("#progress-dialog").attr("label", "Performing operation")
    }

    vidDuration = max;
    if (slider) {
        slider.updateOptions({
            start: [0, max],
            range: {
                min: 0,
                max: max,
            },
        });
        return;
    }

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
