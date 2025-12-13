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
            pptxSlide.addImage({
                data: slide.imageUrl,
                x: 0,
                y: 0,
                w: "100%",
                h: "100%"
            });
        } catch (e) {
            console.error("Failed to add image to slide", e);
            // Fallback to text if image fails
            addTextToSlide(pptxSlide, slide, style);
        }
    } else {
        // No image, render text
        addTextToSlide(pptxSlide, slide, style);
    }
  }

  // Save the presentation
  await pres.writeFile({ fileName: `Presentation-${Date.now()}.pptx` });
};

function addTextToSlide(pptxSlide: any, slide: Slide, style: DeckStyle) {
    // Background color based on style
    if (style.aesthetic === 'minimalist') {
        pptxSlide.background = { color: "FFFFFF" };
        pptxSlide.color = "000000";
    } else if (style.aesthetic === 'vibrant') {
        pptxSlide.background = { color: "FAFAFA" };
    } else {
        pptxSlide.background = { color: "FFFFFF" };
    }

    // Title
    pptxSlide.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: "90%",
      h: 1,
      fontSize: 32,
      bold: true,
      color: "363636",
    });

    // Content (Text)
    pptxSlide.addText(slide.content, {
      x: 0.5,
      y: 1.5,
      w: "90%",
      h: 4,
      fontSize: 18,
      color: "666666",
      valign: "top"
    });
}

export const exportToPDF = async (slides: Slide[], style: DeckStyle) => {
  // A4 Landscape: 297mm x 210mm
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  slides.forEach((slide, index) => {
    if (index > 0) {
      doc.addPage();
    }

    if (slide.imageUrl) {
        try {
            // Full page image
            doc.addImage(slide.imageUrl, 'PNG', 0, 0, pageWidth, pageHeight);
        } catch (e) {
            console.error("Failed to add image to PDF", e);
            addTextToPDFPage(doc, slide, style, pageWidth, pageHeight, index);
        }
    } else {
        addTextToPDFPage(doc, slide, style, pageWidth, pageHeight, index);
    }
  });

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

