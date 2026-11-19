# Deckmind

Deckmind is an AI-powered application designed to revolutionize presentation creation. Leveraging advanced Gemini models and Google Cloud's Vertex AI, Deckmind assists users in generating dynamic content, intelligent imagery, and cohesive visual styles for their presentations.

## Features

*   **AI-Powered Content Generation:** Utilizes Gemini models to assist in generating and refining presentation slide content.
*   **Intelligent Image Generation:** Dynamically creates relevant and visually consistent images for slides, enhancing visual appeal.
*   **Style Extraction & Transformation:** Analyzes provided brand information or URLs to extract and apply consistent visual themes, including color palettes, typography, and mood.
*   **Interactive Deck Preview:** Provides a real-time preview of the generated presentation, allowing for immediate feedback and adjustments.

## Installation

Follow these steps to set up and run Deckmind locally using Docker with Vertex AI integration.

### Prerequisites

Before you begin, ensure you have the following installed and configured:

*   **Docker & Docker Compose:** For containerized application deployment.
*   **Google Cloud SDK:** Installed and authenticated with your Google Cloud account. This is necessary for generating Application Default Credentials.
*   **Application Default Credentials (ADC):** Your `application_default_credentials.json` file should be located in the root directory of this project. If you don't have one, you can generate it by running `gcloud auth application-default login`.

### Configuration

The project is configured to use Google Cloud's Vertex AI for model serving. The necessary environment variables are set in `docker-compose.yml`:

1.  **`application_default_credentials.json`:** Ensure this file is placed in the project's root directory.
2.  **Environment Variables:** The `docker-compose.yml` file configures the following:
    *   `GOOGLE_GENAI_USE_VERTEXAI=true`
    *   `GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID` (Your Google Cloud Project ID)
    *   `GOOGLE_CLOUD_LOCATION=global` (Your Google Cloud location, e.g., `us-central1` or `global`)
    *   `GOOGLE_APPLICATION_CREDENTIALS=/app/application_default_credentials.json` (Path within the container to your ADC file, which is mounted automatically).

### Build and Run

1.  **Open Terminal:** Navigate to the root directory of this project in your terminal.
2.  **Build and Start Containers:** Execute the following command to build the Docker images and start the application in detached mode:

    ```bash
    docker-compose up --build -d
    ```

3.  **Access the Application:** Once the containers are up and running, you can access the application in your web browser at:

    ```
    http://localhost:3100
    ```

    (Note: The host port `3100` can be configured in `docker-compose.yml`.)
