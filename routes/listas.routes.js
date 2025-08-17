/*
Routes: Listas de usuario (Tus listas)
Endpoints:
- GET '/api/get-user-lists' (auth): obtiene las listas del usuario
- POST '/api/create-user-list' (auth): crea una nueva lista 
- POST '/api/save-document-to-lists' (auth): guarda documento en listas seleccionadas
- POST '/api/remove-document-from-list' (auth): quita documento de una lista específica
- DELETE '/api/delete-user-list' (auth): elimina una lista de usuario
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};

// ==================== RUTAS PARA MANEJO DE LISTAS DE USUARIO ====================

// Ruta para obtener las listas del usuario
router.get('/api/get-user-lists', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Obtener las listas del usuario desde el campo 'guardados'
    const guardados = user.guardados || {};
    const lists = Object.keys(guardados).map(listName => ({
      id: listName.replace(/\s+/g, '_').toLowerCase(), // Usar el nombre como ID simplificado
      name: listName
    }));

    await client.close();
    res.json({ 
      lists: lists,
      guardados: guardados // Incluir los datos completos de guardados
    });
  } catch (error) {
    console.error('Error getting user lists:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para crear una nueva lista
router.post('/api/create-user-list', ensureAuthenticated, async (req, res) => {
  try {
    const { listName } = req.body;
    
    if (!listName || !listName.trim()) {
      return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verificar si ya existe una lista con ese nombre
    const guardados = user.guardados || {};
    if (guardados[listName]) {
      return res.status(400).json({ error: 'Ya existe una lista con ese nombre' });
    }

    // Crear la nueva lista vacía
    const updateField = `guardados.${listName}`;
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $set: { [updateField]: {} } } // Cambiar de [] a {} para inicializar como objeto
    );

    await client.close();
    
    const listId = listName.replace(/\s+/g, '_').toLowerCase();
    res.json({ 
      success: true, 
      message: 'Lista creada exitosamente',
      listId: listId,
      listName: listName
    });
  } catch (error) {
    console.error('Error creating user list:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para guardar un documento en listas seleccionadas
router.post('/api/save-document-to-lists', ensureAuthenticated, async (req, res) => {
  try {
    const { documentId, collectionName, listIds, documentData } = req.body;
    
    if (!documentId || !collectionName || !listIds || !Array.isArray(listIds)) {
      return res.status(400).json({ error: 'Parámetros requeridos: documentId, collectionName, listIds' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const guardados = user.guardados || {};
    
    // Obtener las etiquetas personalizadas del usuario
    const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || {};
    
    // Encontrar etiquetas que coincidan con el documento
    let matchingEtiquetas = [];
    if (documentData && documentData.etiquetas_personalizadas && Array.isArray(documentData.etiquetas_personalizadas)) {
      matchingEtiquetas = documentData.etiquetas_personalizadas.filter(etiqueta => 
        Object.keys(userEtiquetasPersonalizadas).some(userEtiqueta => 
          userEtiqueta.toLowerCase() === etiqueta.toLowerCase()
        )
      );
    }
    
    // Crear el objeto del documento a guardar con información completa
    const documentToSave = {
      documentId: documentId,
      collectionName: collectionName,
      savedAt: new Date(),
      // Información adicional del documento
      url_pdf: documentData?.url_pdf || null,
      short_name: documentData?.short_name || null,
      resumen: documentData?.resumen || null,
      rango_titulo: documentData?.rango_titulo || null,
      dia: documentData?.dia || null,
      mes: documentData?.mes || null,
      anio: documentData?.anio || null,
      etiquetas_personalizadas: matchingEtiquetas
    };

    // Procesar cada lista seleccionada
    for (const listId of listIds) {
      // Convertir listId de vuelta al nombre de la lista
      const listName = Object.keys(guardados).find(name => 
        name.replace(/\s+/g, '_').toLowerCase() === listId
      );
      
      if (listName) {
        const existingList = guardados[listName];
        
        // Si la lista es un array, convertirla a objeto primero
        if (Array.isArray(existingList)) {
          console.log(`Converting list "${listName}" from array to object`);
          
          // Crear un objeto con los documentos existentes usando sus IDs como claves
          const convertedList = {};
          existingList.forEach((doc, index) => {
            const docId = doc.documentId || doc._id || `doc_${index}`;
            convertedList[docId] = doc;
          });
          
          // Actualizar la lista completa a formato objeto
          await usersCollection.updateOne(
            { _id: new ObjectId(req.user._id) },
            { $set: { [`guardados.${listName}`]: convertedList } }
          );
        }
        
        // Ahora añadir el nuevo documento usando su ID como clave
        await usersCollection.updateOne(
          { _id: new ObjectId(req.user._id) },
          { $set: { [`guardados.${listName}.${documentId}`]: documentToSave } }
        );
      }
    }

    await client.close();
    
    res.json({ 
      success: true, 
      message: 'Documento guardado exitosamente en las listas seleccionadas',
      savedToLists: listIds.length,
      documentData: documentToSave
    });
  } catch (error) {
    console.error('Error saving document to lists:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para quitar un documento de una lista específica
router.post('/api/remove-document-from-list', ensureAuthenticated, async (req, res) => {
  try {
    const { documentId, listName } = req.body;
    
    if (!documentId || !listName) {
      return res.status(400).json({ error: 'Parámetros requeridos: documentId, listName' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const guardados = user.guardados || {};
    
    // Verificar que la lista existe
    if (!guardados[listName]) {
      return res.status(404).json({ error: 'Lista no encontrada' });
    }

    // Verificar que el documento está en la lista
    const listData = guardados[listName];
    if (!listData[documentId]) {
      return res.status(404).json({ error: 'Documento no encontrado en la lista' });
    }

    // Quitar el documento de la lista
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $unset: { [`guardados.${listName}.${documentId}`]: "" } }
    );

    await client.close();
    
    res.json({ 
      success: true, 
      message: 'Documento eliminado exitosamente de la lista',
      documentId: documentId,
      listName: listName
    });
  } catch (error) {
    console.error('Error removing document from list:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para eliminar una lista de usuario
router.delete('/api/delete-user-list', ensureAuthenticated, async (req, res) => {
  try {
    const { listName } = req.body;
    
    if (!listName || !listName.trim()) {
      return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verificar si la lista existe
    const guardados = user.guardados || {};
    if (!guardados[listName]) {
      return res.status(404).json({ error: 'La lista no existe' });
    }

    // Eliminar la lista
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $unset: { [`guardados.${listName}`]: "" } }
    );

    await client.close();
    
    res.json({ 
      success: true, 
      message: 'Lista eliminada exitosamente',
      deletedList: listName
    });
  } catch (error) {
    console.error('Error deleting user list:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router; 