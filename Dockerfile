# Use a slim, production-ready base image for a smaller size
FROM node:25-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker's layer caching for dependencies
COPY package*.json .

# Install production dependencies only
RUN npm ci --omit=dev
COPY index.ts .

# Expose the port the app runs on (change if necessary)
EXPOSE 8000

# Define the command to start the application
CMD ["node", "index.ts"] 
# If you have a start script in package.json, you can use: CMD ["npm", "start"]
