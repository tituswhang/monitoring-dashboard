FROM eclipse-temurin:21-jre
LABEL APPLICATION="Monitoring Dashboard"
ARG JAR_FILE=build/libs/*.jar
EXPOSE 8080
COPY /build/libs/datawatch-*-SNAPSHOT.jar datawatch.jar
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /datawatch.jar"]
