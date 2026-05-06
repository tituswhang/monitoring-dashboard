FROM eclipse-temurin:21-jre
LABEL APPLICATION="Monitoring Dashboard"
ARG JAR_FILE=build/libs/*.jar
EXPOSE 8080
COPY /build/libs/monitoring-dashboard-*-SNAPSHOT.jar monitoring-dashboard.jar
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /monitoring-dashboard.jar"]
