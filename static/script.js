document.addEventListener("DOMContentLoaded", () => {
    // Elements
    const tabBtns = document.querySelectorAll(".tab-btn");
    const uploadArea = document.getElementById("upload-area");
    const fileInput = document.getElementById("file-input");
    const video = document.getElementById("video");
    const startCameraBtn = document.getElementById("start-camera");
    const captureBtn = document.getElementById("capture-btn");
    const previewArea = document.getElementById("preview-area");
    const imagePreview = document.getElementById("image-preview");
    const predictBtn = document.getElementById("predict-btn");
    const resetBtn = document.getElementById("reset-btn");
    const loader = document.getElementById("loader");
    const resultArea = document.getElementById("result-area");
    const predictionResult = document.getElementById("prediction-result");

    let currentStream = null;
    let cropper = null;

    // Tabs logic
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove active class
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            
            // Add active class
            btn.classList.add("active");
            document.getElementById(btn.dataset.target).classList.add("active");

            // Stop camera if navigating away
            if (btn.dataset.target !== "camera-tab") {
                stopCamera();
            }
        });
    });

    // Upload logic
    uploadArea.addEventListener("click", () => fileInput.click());

    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
    });

    uploadArea.addEventListener("dragleave", () => {
        uploadArea.classList.remove("dragover");
    });

    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith("image/")) {
            alert("Please upload an image file.");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            showPreview(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    // Camera logic
    startCameraBtn.addEventListener("click", async () => {
        try {
            // Request camera access (facing user or back camera)
            currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            video.srcObject = currentStream;
            startCameraBtn.classList.add("hidden");
            captureBtn.classList.remove("hidden");
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access camera. Please check permissions.");
        }
    });

    captureBtn.addEventListener("click", () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const url = canvas.toDataURL("image/jpeg", 0.95);
        showPreview(url);
        stopCamera();
    });

    function stopCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        video.srcObject = null;
        startCameraBtn.classList.remove("hidden");
        captureBtn.classList.add("hidden");
    }

    // Preview and Cropper logic
    function showPreview(src) {
        // Destroy existing cropper if it exists
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        
        imagePreview.src = src;
        previewArea.classList.remove("hidden");
        
        // Hide inputs while previewing
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.querySelector(".tabs").classList.add("hidden");
        
        // Initialize Cropper.js on the loaded image
        // We use a small timeout to let the browser render the image
        setTimeout(() => {
            cropper = new Cropper(imagePreview, {
                viewMode: 1,      // restrict crop box to not exceed size of canvas
                dragMode: 'move', // allow moving the image within cropper
                autoCropArea: 0.8,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            });
        }, 100);
    }

    resetBtn.addEventListener("click", () => {
        hidePreview();
    });

    function hidePreview() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        
        previewArea.classList.add("hidden");
        resultArea.classList.add("hidden");
        document.querySelector(".tabs").classList.remove("hidden");
        
        const activeTab = document.querySelector(".tab-btn.active").dataset.target;
        document.getElementById(activeTab).classList.add("active");
        
        fileInput.value = "";
    }

    predictBtn.addEventListener("click", async () => {
        if (!cropper) return;

        // Extract the cropped image inside the bounding box
        cropper.getCroppedCanvas({
            maxWidth: 1024,
            maxHeight: 1024,
            fillColor: '#fff',
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'high',
        }).toBlob(async (blob) => {
            if (!blob) {
                alert("Could not crop image.");
                return;
            }

            // Show loader, hide result and predict button
            loader.classList.remove("hidden");
            resultArea.classList.add("hidden");
            predictBtn.classList.add("hidden");
            resetBtn.classList.add("hidden");

            const formData = new FormData();
            formData.append("file", blob, "cropped.jpg");

            try {
                const response = await fetch("/predict", {
                    method: "POST",
                    body: formData
                });
                
                if (!response.ok) {
                    let errorStr = "Analysis failed.";
                    try {
                        const errJson = await response.json();
                        errorStr = errJson.detail || errorStr;
                    } catch(e) {}
                    throw new Error(errorStr);
                }

                const data = await response.json();
                
                // Show result
                predictionResult.textContent = data.prediction || "No text found";
                resultArea.classList.remove("hidden");
                
            } catch (error) {
                console.error(error);
                alert("Error analyzing image: " + error.message);
            } finally {
                loader.classList.add("hidden");
                predictBtn.classList.remove("hidden");
                resetBtn.classList.remove("hidden");
            }
        }, "image/jpeg", 0.95);
    });
});
