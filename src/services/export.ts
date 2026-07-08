import pptxgen from "pptxgenjs";
import { jsPDF } from "jspdf";
import { Slide, DeckStyle } from "../types";

export const exportToPPTX = async (slides: Slide[], style: DeckStyle) => {
  const pres = new pptxgen();

  // Set basic deck properties
  pres.author = 'Gemini Slide Creator';
  pres.company = 'Gemini Slide Creator';
  pres.title = 'My Presentation';

  // Add slides
  for (const slide of slides) {
    const pptxSlide = pres.addSlide();

    if (slide.imageUrl) {
        // If image exists, use it as the full slide content
        try {
            // Ensure we have base64 data even if it's a URL
            const { base64 } = await getImageData(slide.imageUrl);
            
            pptxSlide.addImage({
                data: base64,
                x: 0,
                y: 0,
                w: "100%",
                h: "100%",
                sizing: { type: "cover", w: "100%", h: "100%" }
            });
        } catch (e) {
            console.error("Failed to add image to slide", e);
        }
    }
    
    // Check generation mode: if 'background', we MUST render text.
    // If 'full' (or undefined/legacy), we assume the image has text, BUT the user might want editable text anyway?
    // The previous request said: "I also like the old way where text is rendered by image generation model... so can you make a toggle... but default is the old way."
    // So:
    // If 'full' -> Image has text. Do NOT render PPTX text (or render hidden?). The prompt implies we want the *image* to handle design.
    // If 'background' -> Image is bg. Render PPTX text.
    
    // We can check slide.generationMode.
    // If slide.imageUrl exists AND generationMode !== 'background', we assume it's full mode -> Skip text overlay.
    // If slide.imageUrl exists AND generationMode === 'background', we render text overlay.
    // If no image, always render text.
    
    const shouldRenderText = !slide.imageUrl || slide.generationMode === 'background';
    
    if (shouldRenderText) {
         addTextToSlide(pptxSlide, slide, style, !!slide.imageUrl);
    }
  }

  // Save the presentation
  await pres.writeFile({ fileName: `Presentation-${Date.now()}.pptx` });
};

function addTextToSlide(pptxSlide: any, slide: Slide, style: DeckStyle, hasImage: boolean) {
    // Background color based on style (only if no image)
    if (!hasImage) {
        if (style.aesthetic === 'minimalist') {
            pptxSlide.background = { color: "FFFFFF" };
            pptxSlide.color = "000000";
        } else if (style.aesthetic === 'vibrant') {
            pptxSlide.background = { color: "FAFAFA" };
        } else {
            pptxSlide.background = { color: "FFFFFF" };
        }
    }

    // Title
    pptxSlide.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: "90%",
      h: 1,
      fontSize: 32,
      bold: true,
      color: hasImage ? "FFFFFF" : "363636", // White text if image background
      shadow: hasImage ? { type: 'outer', color: '000000', blur: 3, offset: 2, angle: 45, opacity: 0.5 } : undefined
    });

    // Content (Text)
    pptxSlide.addText(slide.content, {
      x: 0.5,
      y: 1.5,
      w: "90%",
      h: 4,
      fontSize: 18,
      color: hasImage ? "FFFFFF" : "666666",
      valign: "top",
      shadow: hasImage ? { type: 'outer', color: '000000', blur: 3, offset: 2, angle: 45, opacity: 0.5 } : undefined
    });
}

// Helper to get image dimensions
const getImageData = async (src: string): Promise<{ base64: string; width: number; height: number }> => {
  // If it's a URL (from our backend), fetch it first
  let dataUrl = src;
  if (src.startsWith('/') || src.startsWith('http')) {
      const response = await fetch(src);
      const blob = await response.blob();
      dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
      });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ base64: dataUrl, width: img.width, height: img.height });
    img.src = dataUrl;
  });
};

export const exportToPDF = async (slides: Slide[], style: DeckStyle) => {
  // Determine page format based on the first slide with an image
  let format: string | number[] = "a4";
  let orientation: "landscape" | "portrait" = "landscape";
  let unit: "mm" | "px" = "mm";
  let width = 297; // Default A4 width in mm
  let height = 210; // Default A4 height in mm

  const firstImageSlide = slides.find(s => s.imageUrl);
  
  if (firstImageSlide?.imageUrl) {
      try {
          const dims = await getImageData(firstImageSlide.imageUrl);
          width = dims.width;
          height = dims.height;
          format = [width, height];
          orientation = width > height ? "landscape" : "portrait";
          unit = "px";
      } catch (e) {
          console.warn("Failed to get image dimensions, falling back to A4", e);
      }
  }

  const doc = new jsPDF({
    orientation: orientation,
    unit: unit,
    format: format
  });

  // width/height variables are now correct for the page size (whether px or mm)
  // Re-fetch page size just to be safe with jsPDF internals
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // We need to use a for...of loop to handle async image fetching sequentially
  for (let index = 0; index < slides.length; index++) {
    const slide = slides[index];
    if (index > 0) {
      doc.addPage(format, orientation);
    }

    if (slide.imageUrl) {
        try {
            const { base64, width: imgW, height: imgH } = await getImageData(slide.imageUrl);
            
            // Full page image with "cover" behavior (maintain aspect ratio)
            const imgRatio = imgW / imgH;
            const pageRatio = pageWidth / pageHeight;

            let renderW = pageWidth;
            let renderH = pageHeight;
            let offsetX = 0;
            let offsetY = 0;

            if (imgRatio > pageRatio) {
                // Image is wider than page: scale by height, crop width
                renderH = pageHeight;
                renderW = pageHeight * imgRatio;
                offsetX = (pageWidth - renderW) / 2; // Center horizontally
            } else {
                // Image is taller than page: scale by width, crop height
                renderW = pageWidth;
                renderH = pageWidth / imgRatio;
                offsetY = (pageHeight - renderH) / 2; // Center vertically
            }

            doc.addImage(base64, 'PNG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
        } catch (e) {
            console.error("Failed to add image to PDF", e);
            addTextToPDFPage(doc, slide, style, pageWidth, pageHeight, index);
        }
    } else {
        addTextToPDFPage(doc, slide, style, pageWidth, pageHeight, index);
    }
  }

  doc.save(`Presentation-${Date.now()}.pdf`);
};

function addTextToPDFPage(doc: jsPDF, slide: Slide, style: DeckStyle, pageWidth: number, pageHeight: number, index: number) {
    // Background (simple fill)
    if (style.aesthetic === 'vibrant') {
       doc.setFillColor(250, 250, 250);
       doc.rect(0, 0, pageWidth, pageHeight, 'F');
    }

    // Title
    doc.setFontSize(24);
    doc.setTextColor(54, 54, 54);
    doc.setFont("helvetica", "bold");
    doc.text(slide.title, 20, 30);

    // Content
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    
    // Split text to fit column
    const textLines = doc.splitTextToSize(slide.content, pageWidth - 40); 
    doc.text(textLines, 20, 50);

    // Footer / Page Number
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`${index + 1}`, pageWidth - 10, pageHeight - 10);
}

