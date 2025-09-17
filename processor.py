"""
Legal Initiatives Processor Module

This module processes documents to extract and classify legal initiatives
using gpt-5-mini, creating structured JSON data for MongoDB storage.
"""

import asyncio
import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import openai
from src.initialize import get_openai_client, get_mongodb_client

logger = logging.getLogger(__name__)


class LegalInitiativesProcessor:
    """Processes documents to extract legal initiatives and their metadata."""

    # Initiative types (closed list)
    "INITIATIVE_TYPES" = [
        "Proyecto de ley",
        "Proposición de ley",
        "Iniciativa legislativa popular",
        "Reforma del reglamento de la camara",
        "Decreto-ley",
        "Decreto Foral",
        "Ley",
        "Enmienda",
        "Dictamen",
        "Informe",
        "Debate",
        "Consulta pública",
        "Proposición no de ley",
        "Interpelación",
        "Moción",
        "Comparacencia",
        "Pregunta escrita",
        "Pregunta oral",
        "Respuesta del gobierno",
        "Solicitud/Petición de información",
        "Control de cumplimiento",
        "Organización de comisiones y nombramientos",
        "Comision de investigación",
        "Solicitud de creación",
        "Iniciativa parlamentaria europea",
        "Plan estratégico",
        "Convenio",
        "Acuerdo",
        "Complemento de resolución o moción",
        "Declaración institucional",
        "Pronuncionamiento de la Comisión" ]

    # Column definitions for the initiatives table
    COLUMNS = {
        "sector": [
            "Alimentación", 
            "Economía Circular", 
            "Sequía",
            "Salud", 
            "Primario", 
            "Pesca",
            "Medioambiente", 
            "Minería", 
            "Energía", 
            "Movilidad", 
            "Financiero y seguros", 
            "Juego", 
            "Otros", 
            "Empresa",
            "Defensa", 
            "Digitalización", 
            "Comercio",
            "Innovación",
            "Turismo",
            "Vivienda",
            "Industria",
            "Infraestructuras", 
            "Consumo", 
            "Farmacéutico", 
            "Telecomunicaciones", 
            "Unión Europea", 
            "Institucional", 
            "Cultura",
            "Fondos UE",
            "Ganadería",
            "Digitaliazación",
            "Fitosanitarios",
            "Educación",
            "Financiero",
            "Videojuegos",
            "Tabaco",
            "Ferroviario",
            "Audiovisual",
            "Empleo",
            "Presupuestos",
            "Aluminio",
            "General",
            "Cáncer",
            "Adicciones",
            "IA"
        ],
        "marco_geografico": [
            "Autonómico",
            "Nacional",
            "Municipal",
            "Provincial",
            "Europeo",
            "Internacional",
        ],
        "fuente": [
            "Congreso",
            "Senado",
            "Parlamento Europeo",
            "Parlamento Autonómico",
            "Consejo de Ministros",
            "Comisión Europea",
        ],
        "tipo_iniciativa": INITIATIVE_TYPES,
    }

    def __init__(self):
        """Initialize the processor with OpenAI client."""
        self.client = None
        self.db = None

    async def initialize(self):
        """Initialize async resources."""
        self.client = await get_openai_client()
        mongo_client = await get_mongodb_client()
        self.db = mongo_client["papyrus"]

    def _build_prompt(self, document_text: str) -> str:
        """Build the prompt for gpt-5-mini to extract initiatives."""

        # Build the closed lists section
        closed_lists = "LISTAS CERRADAS PARA CLASIFICACIÓN:\n\n"
        for column, values in self.COLUMNS.items():
            closed_lists += f"<{column.upper()}>\n"
            for value in values:
                closed_lists += f"  - {value}\n"
            closed_lists += f"</{column.upper()}>\n"

        prompt = f"""Analiza el siguiente documento legal y extrae TODAS las iniciativas legislativas mencionadas.

                    {closed_lists}

                    <INSTRUCCIONES>
                    1. Identifica TODAS las iniciativas legislativas mencionadas en el documento
                    2. Para cada iniciativa, extrae la siguiente información:
                    - id: identificador único de la iniciativa (formato depende de la fuente)
                    - tipo_iniciativa: Clasificar según la lista cerrada proporcionada
                    - titulo_iniciativa: Título o descripción breve de la iniciativa
                    - sector: Clasificar según la lista cerrada
                    - subsector: Determinar mediante razonamiento según el contenido y los ejemplos. Formato exacto: "{sector} - {Subsector_determinado_por_ia}"
                    - tema: Determinar mediante razonamiento y ejemplos (no lista cerrada)
                    - marco_geografico: Clasificar según la lista cerrada
                    - fuente: Origen de la iniciativa según la lista cerrada
                    - proponente: Determinar mediante razonamiento y ejemplos (no lista cerrada)
                    - fecha: Fecha de la iniciativa (formato YYYY-MM-DD) si está disponible

                    3. Si un campo no puede determinarse del texto, usa "No especificado"
                    4. Devuelve ÚNICAMENTE un JSON válido sin texto adicional
                    </INSTRUCCIONES>

                    <EJEMPLOS_DE_SUBSECTOR>
                    Salud - Cáncer
                    Primario - Cárnico
                    Primario - Agricultura
                    Minería - Silicosis
                    Energía - Eficiencia Energética
                    Economía Circular - Residuos
                    Movilidad - VTC
                    Movilidad - Taxi
                    Salud - Dental
                    Energía - Renovables
                    Energía - Gas
                    Medioambiente - Emisiones
                    </EJEMPLOS_DE_SUBSECTOR>

                    <EJEMPLOS_DE_TEMA>
                    Doñana
                    Sostenibilidad
                    PIB
                    Ganadería
                    Ecoturismo
                    Agua
                    Digitalización
                    Biodiversidad
                    Cáncer
                    Energía - Renovables - Eólica
                    Industria - Automotriz
                    Vivienda
                    IA
                    Tabaco
                    Combustible
                    Vehículos
                    </EJEMPLOS_DE_TEMA>

                    <EJEMPLOS_DE_PROPONENTE>
                    Grupo Popular
                    Grupo Socialista
                    Pleno
                    Comisión de Agricultura, Pesca y Alimentación
                    Gobierno de Andalucía
                    Grupo VOX
                    Grupo Candidatura d'Unitat Popular
                    Grupo Junts per Catalunya
                    Grupo Socialistes i Units per avançar
                    Grupo En Comú Podem
                    Grupo Ciudadanos
                    No adscritos
                    Grupo BNG
                    </EJEMPLOS_DE_PROPONENTE>

                    <FORMATO_DE_RESPUESTA>
                    {{
                    "iniciativas": [
                    {{
                    "id": "string | 'No especificado'",
                    "tipo_iniciativa": "valor de la lista cerrada o 'No especificado'",
                    "titulo_iniciativa": "string | 'No especificado'",
                    "sector": "valor de la lista cerrada o 'No especificado'",
                    "subsector": "string | 'No especificado'",
                    "tema": "string | 'No especificado'",
                    "marco_geografico": "valor de la lista cerrada o 'No especificado'",
                    "fuente": "valor de la lista cerrada o 'No especificado'",
                    "proponente": "string | 'No especificado'",
                    "fecha": "YYYY-MM-DD | 'No especificado'"
                    }}
                    // ... más iniciativas si existen
                    ]
                    }}
                    </FORMATO_DE_RESPUESTA>

                    <EJEMPLO_DE_RESPUESTA>
                    {{
                    "iniciativas": [
                    {{
                    "id": "PL-2024-15",
                    "tipo_iniciativa": "proyecto_de_ley",
                    "titulo_iniciativa": "Ley de fomento de la movilidad sostenible",
                    "sector": "Movilidad",
                    "subsector": "Movilidad - Movilidad Sostenible",
                    "tema": "Sostenibilidad",
                    "marco_geografico": "Nacional",
                    "fuente": "Congreso",
                    "proponente": "Gobierno",
                    "fecha": "2024-05-20"
                    }},
                    {{
                    "id": "No especificado",
                    "tipo_iniciativa": "proposicion_no_de_ley",
                    "titulo_iniciativa": "Impulso a la digitalización del sector salud",
                    "sector": "Salud",
                    "subsector": "Salud - Digitalización",
                    "tema": "Digitalización",
                    "marco_geografico": "Europeo",
                    "fuente": "Parlamento Europeo",
                    "proponente": "Grupo Socialista",
                    "fecha": "No especificado"
                    }}
                    }}
                    </EJEMPLO_DE_RESPUESTA>

                    IMPORTANTE: 
                    - Usa SOLO los valores de las listas cerradas proporcionadas para: tipo_iniciativa, sector, marco_geografico y fuente
                    - Determina mediante razonamiento y basándote en los ejemplos: subsector, tema y proponente
                    - Si encuentras múltiples iniciativas, incluye todas
                    - Mantén consistencia en la nomenclatura
                    - No inventes información que no esté en el documento"""

        return prompt

    async def extract_initiatives(
        self, document_text: str, document_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Extract legal initiatives from document text using gpt-5-mini.

        Args:
            document_text: The text content to analyze
            document_id: Optional document identifier for metadata

        Returns:
            Dictionary with extracted initiatives or None if extraction fails
        """
        try:
            # Validate text
            if not document_text:
                logger.warning(f"Document {document_id or 'unknown'} has no content")
                return None

            # Build prompt
            prompt = self._build_prompt(document_text)

            # Call gpt-5-mini
            response = await self.client.chat.completions.create(
                model="gpt-5-mini",
                messages=[
                    {
                        "role": "system",
                        "content": prompt,
                    },
                    {
                        "role": "user",
                        "content": "<DOCUMENTO>" + document_text + "</DOCUMENTO>",
                    },
                ],
                seed=1,
                response_format={"type": "json_object"},
                metadata={"prompt": "legal_initiatives"},
            )

            # Parse response
            result_text = response.choices[0].message.content
            result = json.loads(result_text)

            # Validate and clean result
            if "iniciativas" not in result:
                result = {"iniciativas": []}

            # Add metadata
            result["extraction_metadata"] = {
                "document_id": document_id,
                "extraction_date": datetime.now().isoformat(),
                "model": "gpt-5-mini",
                "total_initiatives": len(result.get("iniciativas", [])),
            }

            # Add token usage stats
            if response.usage:
                result["extraction_metadata"]["tokens"] = {
                    "input": response.usage.prompt_tokens,
                    "output": response.usage.completion_tokens,
                    "total": response.usage.total_tokens,
                }

            return result

        except json.JSONDecodeError as e:
            logger.error(
                f"Failed to parse JSON response for document {document_id or 'unknown'}: {e}"
            )
            return None
        except Exception as e:
            logger.error(
                f"Error extracting initiatives from document {document_id or 'unknown'}: {e}"
            )
            return None

    async def process_documents_batch(
        self, documents: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Process a batch of documents to extract legal initiatives before MongoDB upload.

        Args:
            documents: Dictionary of documents with doc_id as key

        Returns:
            Tuple of (processed_documents, extraction_stats)
        """
        from typing import Tuple

        stats = {
            "documents_processed": 0,
            "initiatives_found": 0,
            "documents_with_initiatives": 0,
            "errors": 0,
            "total_tokens": 0,
        }

        for doc_id, doc in documents.items():
            stats["documents_processed"] += 1

            # Get document text (from page_content or contenido field)
            text = (
                doc.page_content
                if hasattr(doc, "page_content")
                else doc.metadata.get("contenido", "")
            )

            if not text:
                logger.warning(f"Document {doc_id} has no text content")
                stats["errors"] += 1
                continue

            # Extract initiatives
            result = await self.extract_initiatives(text, doc_id)

            if result:
                # Add initiatives to document metadata
                doc.metadata["legal_initiatives"] = result

                # Update stats
                initiatives = result.get("iniciativas", [])
                stats["initiatives_found"] += len(initiatives)
                if initiatives:
                    stats["documents_with_initiatives"] += 1

                # Add token usage
                if "tokens" in result.get("extraction_metadata", {}):
                    stats["total_tokens"] += result["extraction_metadata"]["tokens"][
                        "total"
                    ]
            else:
                stats["errors"] += 1
                logger.warning(f"Failed to extract initiatives from document {doc_id}")

        return documents, stats

    async def process_collection_documents(
        self,
        collection_name: str,
        date_filter: Optional[Dict] = None,
        limit: int = None,
    ) -> Dict[str, Any]:
        """
        Process all documents in a collection to extract initiatives.

        Args:
            collection_name: Name of the MongoDB collection to process
            date_filter: Optional date filter for documents
            limit: Optional limit on number of documents to process

        Returns:
            Summary statistics of the processing
        """
        stats = {
            "collection": collection_name,
            "documents_processed": 0,
            "initiatives_found": 0,
            "documents_with_initiatives": 0,
            "errors": 0,
            "total_tokens": 0,
            "processing_time": None,
        }

        start_time = datetime.now()

        try:
            collection = self.db[collection_name]

            # Build query
            query = {}
            if date_filter:
                query.update(date_filter)

            # Get documents
            cursor = collection.find(query)
            if limit:
                cursor = cursor.limit(limit)

            documents = await cursor.to_list(length=None)

            logger.info(f"Processing {len(documents)} documents from {collection_name}")

            # Process each document
            for doc in documents:
                stats["documents_processed"] += 1

                # Skip if already processed
                if "legal_initiatives" in doc:
                    existing_initiatives = doc.get("legal_initiatives", {}).get(
                        "iniciativas", []
                    )
                    stats["initiatives_found"] += len(existing_initiatives)
                    if existing_initiatives:
                        stats["documents_with_initiatives"] += 1
                    continue

                # Extract initiatives
                result = await self.extract_initiatives(doc)

                if result:
                    # Update document with initiatives
                    await collection.update_one(
                        {"_id": doc["_id"]}, {"$set": {"legal_initiatives": result}}
                    )

                    # Update stats
                    initiatives = result.get("iniciativas", [])
                    stats["initiatives_found"] += len(initiatives)
                    if initiatives:
                        stats["documents_with_initiatives"] += 1

                    # Add token usage
                    if "tokens" in result.get("extraction_metadata", {}):
                        stats["total_tokens"] += result["extraction_metadata"][
                            "tokens"
                        ]["total"]
                else:
                    stats["errors"] += 1

                # Add small delay to avoid rate limits
                await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"Error processing collection {collection_name}: {e}")
            stats["errors"] += 1

        # Calculate processing time
        stats["processing_time"] = (datetime.now() - start_time).total_seconds()

        return stats

    async def get_initiatives_summary(self, collection_name: str) -> Dict[str, Any]:
        """
        Get a summary of all initiatives in a collection.

        Args:
            collection_name: Name of the MongoDB collection

        Returns:
            Summary statistics and aggregated data
        """
        collection = self.db[collection_name]

        # Aggregate initiatives data
        pipeline = [
            {"$match": {"legal_initiatives": {"$exists": True}}},
            {"$unwind": "$legal_initiatives.iniciativas"},
            {
                "$group": {
                    "_id": None,
                    "total_initiatives": {"$sum": 1},
                    "by_type": {
                        "$push": "$legal_initiatives.iniciativas.tipo_iniciativa"
                    },
                    "by_sector": {"$push": "$legal_initiatives.iniciativas.sector"},
                    "by_proponente": {
                        "$push": "$legal_initiatives.iniciativas.proponente"
                    },
                    "by_marco": {
                        "$push": "$legal_initiatives.iniciativas.marco_geografico"
                    },
                }
            },
        ]

        result = await collection.aggregate(pipeline).to_list(length=1)

        if not result:
            return {"message": "No initiatives found in collection"}

        data = result[0]

        # Count occurrences
        def count_values(values_list):
            counts = {}
            for value in values_list:
                counts[value] = counts.get(value, 0) + 1
            return counts

        summary = {
            "collection": collection_name,
            "total_initiatives": data["total_initiatives"],
            "distribution": {
                "by_type": count_values(data["by_type"]),
                "by_sector": count_values(data["by_sector"]),
                "by_proponente": count_values(data["by_proponente"]),
                "by_marco_geografico": count_values(data["by_marco"]),
            },
        }

        return summary


async def process_bocg_initiatives(
    date_start: str = None, date_end: str = None
) -> Dict[str, Any]:
    """
    Main function to process BOCG documents for legal initiatives.

    Args:
        date_start: Start date for filtering (YYYY-MM-DD format)
        date_end: End date for filtering (YYYY-MM-DD format)

    Returns:
        Processing statistics
    """
    processor = LegalInitiativesProcessor()
    await processor.initialize()

    # Build date filter if provided
    date_filter = {}
    if date_start and date_end:
        date_filter = {"fecha_publicacion": {"$gte": date_start, "$lte": date_end}}

    # Process BOCG collection
    stats = await processor.process_collection_documents(
        collection_name="BOCG", date_filter=date_filter
    )

    # Get summary
    summary = await processor.get_initiatives_summary("BOCG")

    # Combine results
    result = {
        "processing_stats": stats,
        "initiatives_summary": summary,
        "timestamp": datetime.now().isoformat(),
    }

    logger.info(f"Legal initiatives processing completed: {stats}")

    return result
