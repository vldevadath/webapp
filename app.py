import os
import cv2
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import shutil
import tempfile
import uuid

app = FastAPI()

# Mount frontend build directory. We'll create it soon.
app.mount("/static", StaticFiles(directory="static"), name="static")

# Load the model directly
MODEL_PATH = "alphabet_not_case.keras"
if os.path.exists(MODEL_PATH):
    model_load = tf.keras.models.load_model(MODEL_PATH)
else:
    print(f"WARNING: Model not found at {MODEL_PATH}")
    model_load = None

alphabet_dict = {
    0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F', 6: 'G', 7: 'H', 8: 'I', 9: 'J',
    10: 'K', 11: 'L', 12: 'M', 13: 'N', 14: 'O', 15: 'P', 16: 'Q', 17: 'R', 18: 'S', 19: 'T',
    20: 'U', 21: 'V', 22: 'W', 23: 'X', 24: 'Y', 25: 'Z'
}

def predict_alphabet(processed_img_path):
    test_img = cv2.imread(processed_img_path, cv2.IMREAD_GRAYSCALE)
    if test_img is None:
        return ""
    # Explicitly shape properly
    test_img = cv2.resize(test_img, (28, 28))
    test_img_input = test_img.reshape(1, 28, 28, 1).astype('float32') / 255.0
    prediction = model_load.predict(test_img_input)
    return alphabet_dict.get(np.argmax(prediction).item(), "?")

def predict_image(img_path):
    if model_load is None:
        raise Exception("Model is not loaded.")
        
    full_img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if full_img is None:
        raise Exception("Image could not be read.")

    blurred = cv2.GaussianBlur(full_img, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    kernel = np.ones((2, 2), np.uint8)
    optimized_page = cv2.dilate(thresh, kernel, iterations=1)
    
    contours, _ = cv2.findContours(optimized_page, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    rects = [cv2.boundingRect(c) for c in contours]
    rects.sort(key=lambda x: x[0])
    
    text = ""
    
    with tempfile.TemporaryDirectory() as temp_dir:
        for i, (x, y, w, h) in enumerate(rects):
            if w > 5 and h > 5:
                digit_crop = optimized_page[y:y+h, x:x+w]
                
                side = max(w, h) + 20
                square_canvas = np.zeros((side, side), dtype=np.uint8)
                
                off_x = (side - w) // 2
                off_y = (side - h) // 2
                
                # Check for out of bounds issues just in case
                if off_y >= 0 and off_x >= 0 and off_y+h <= side and off_x+w <= side:
                    square_canvas[off_y:off_y+h, off_x:off_x+w] = digit_crop
                
                final_digit = cv2.resize(square_canvas, (28, 28), interpolation=cv2.INTER_AREA)
                
                file_path = os.path.join(temp_dir, f"{i}.png")
                cv2.imwrite(file_path, final_digit)
                
                text += predict_alphabet(file_path)
                
    return text

@app.post("/predict")
async def handle_predict(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
        
    # generate a unique filename for the temp upload
    temp_filepath = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_{file.filename}")
    
    try:
        with open(temp_filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        result = predict_image(temp_filepath)
        return JSONResponse(content={"prediction": result})
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_filepath):
            os.remove(temp_filepath)

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
