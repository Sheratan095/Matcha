import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Microservice } from './Models/Microservice';

export function setupSwagger(app: any, services : Microservice[])
{
	const	config = new DocumentBuilder()
		.setTitle('Gateway API')
		.setVersion('1.0')
		// .addBearerAuth() // for JWT auth
		.addServer('/')
		.build();

	const	document = SwaggerModule.createDocument(app, config);

	// Aggregate the docs URLs from all microservices (objects expected by swagger-ui)
	const urls: { url: string; name: string }[] = [];
	for (const microservice of services)
	{
		if (microservice && microservice.docsUrl)
			urls.push({ url: microservice.docsUrl, name: microservice.name || microservice.docsUrl });
	}

	// Add the gateway's own docs
	urls.unshift({ url: '/docs-json', name: 'gateway' });

	SwaggerModule.setup('docs', app, document, {
		explorer: true,
		swaggerOptions: {
			urls,
		},
	});
}
